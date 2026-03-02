"""
=============================================================================
SMART BETA ETF — CHECKS 1 & 2 ONLY
=============================================================================
Goldman Sachs | Quantitative Investment Strategies (QIS)
Version : 2.0.0
Date    : 2026-02-22

Checks implemented
------------------
  1. Multi-Factor OLS Regression   — factor loadings, alpha, R², HAC SEs
  2. Rolling 36-Month Regression   — loading stability over time

Factor universe (9 factors — Ken French + FRED/yfinance only)
--------------------------------------------------------------
  MKT   : Market excess return          — FF3 (Ken French)
  SMB   : Small Minus Big (size)        — FF3 (Ken French)
  HML   : High Minus Low (value)        — FF3 (Ken French)
  MOM   : Momentum / UMD                — F-F_Momentum_Factor (Ken French)
  BAB   : Beta-sorted Lo20%% - Hi20%%   — Portfolios_Formed_on_BETA (Ken French)
  QMJ   : (RMW + CMA) / 2 proxy        — FF5 (Ken French)
  RMW   : Robust Minus Weak (profit.)   — FF5 (Ken French)
  CARRY : G10 FX rank-weighted carry    — FRED 3M rates + yfinance FX spots
  ILLIQ : Illiquid Minus Liquid (IML)   — Amihud (2002) via yfinance daily OHLCV

Data sources
------------
  ETF prices  : yfinance
  FF3 / FF5   : Ken French data library (direct ZIP download)
  Momentum    : Ken French "F-F_Momentum_Factor" (direct ZIP download)
  Beta sorts  : Ken French "Portfolios_Formed_on_BETA" (direct ZIP download)
  CARRY rates : FRED CSV API (G10 3M interbank rates, no pandas_datareader)
  CARRY FX    : yfinance (monthly G10 spot rates)
  ILLIQ       : yfinance daily OHLCV for curated 30-stock panel (Amihud ratio sort)

Usage
-----
  python smart_beta_checks_comprehensive.py              # all ETFs
  python smart_beta_checks_comprehensive.py --etf MTUM  # subset

Dependencies
------------
  pip install numpy pandas pandas-datareader statsmodels matplotlib seaborn tabulate yfinance
=============================================================================
"""

# ── Standard library ──────────────────────────────────────────────────────────
import argparse
import logging
import sys
import warnings
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")

# ── Third-party ───────────────────────────────────────────────────────────────
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant
from tabulate import tabulate

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("GS.QIS.Checks12")


# =============================================================================
# SECTION 1 — CONFIGURATION
# =============================================================================

@dataclass
class ETFConfig:
    ticker          : str
    full_name       : str
    factor_strategy : str
    target_factors  : List[str]   # factors the ETF claims to harvest
    expected_signs  : Dict[str, Optional[int]]   # +1, -1, or None (no directional requirement)
    expense_ratio   : float
    metadata_source : str = "hardcoded"   # "live" once enriched by yfinance


ETF_CONFIGS: Dict[str, ETFConfig] = {
    "USMV": ETFConfig(
        ticker          = "USMV",
        full_name       = "iShares MSCI USA Min Vol Factor ETF",
        factor_strategy = "Low Volatility",
        target_factors  = ["BAB"],        # Betting Against Beta is the canonical low-vol factor
        expected_signs  = {
            "MKT": 1, "HML": None, "SMB": None, "MOM": None,
            "BAB": 1,  # positive: holds low-beta / low-vol stocks
            "QMJ": None, "RMW": None, "CARRY": None,
            "ILLIQ": None,  # MSCI USA Min Vol spans market caps; no directional illiquidity thesis
        },
        expense_ratio   = 0.0015,
    ),
    "MTUM": ETFConfig(
        ticker          = "MTUM",
        full_name       = "iShares MSCI USA Momentum Factor ETF",
        factor_strategy = "Momentum",
        target_factors  = ["MOM"],
        expected_signs  = {
            "MKT": 1, "HML": -1,  # momentum winners = growth stocks → negative value loading
            "SMB": None, "MOM": 1,
            "BAB": None, "QMJ": None, "RMW": None, "CARRY": None,
            "ILLIQ": None,  # no systematic illiquidity tilt in momentum strategies
        },
        expense_ratio   = 0.0015,
    ),
    "QUAL": ETFConfig(
        ticker          = "QUAL",
        full_name       = "iShares MSCI USA Quality Factor ETF",
        factor_strategy = "Profitability",
        target_factors  = ["RMW"],  # QMJ (AQR) is primary; RMW (FF5) is supplementary
        expected_signs  = {
            "MKT": 1, "HML": None,
            "SMB": -1,  # quality firms tend to be large-caps
            "MOM": None,
            "BAB": None,
            "QMJ": 1,   # long high-quality firms
            "RMW": 1,   # long robust/profitable firms
            "CARRY": None,
            "ILLIQ": None,  # quality spans market caps; no directional illiquidity claim
        },
        expense_ratio   = 0.0015,
    ),
    "IWC": ETFConfig(
        ticker          = "IWC",
        full_name       = "iShares Micro-Cap ETF",
        factor_strategy = "Illiquidity / Size",
        target_factors  = ["SMB", "ILLIQ"],   # micro-caps are the canonical illiquidity play
        expected_signs  = {
            "MKT": 1,
            "HML": 1,   # micro-caps tend to be value-tilted
            "SMB": 1,   # positive: pure small/micro-cap tilt
            "MOM": None,
            "BAB": None, "QMJ": None, "RMW": None, "CARRY": None,
            "ILLIQ": 1,  # positive: micro-caps earn the illiquidity premium (Amihud 2002)
        },
        expense_ratio   = 0.0060,
    ),
    "PRFZ": ETFConfig(
        ticker          = "PRFZ",
        full_name       = "Invesco FTSE RAFI US 1500 Small-Mid ETF",
        factor_strategy = "Fundamental Weighting / Illiquidity",
        # RAFI weights constituents by book value, cash flow, sales, and dividends —
        # not market cap.  Arnott et al. (2005) show this systematically over-weights
        # stocks priced at a discount to their economic footprint (illiquid value stocks)
        # and rebalances by buying recent losers / selling recent winners.
        # The rebalancing alpha is largely an illiquidity premium: the portfolio
        # persistently buys cheap (illiquid) and sells expensive (liquid) stocks.
        # PRFZ covers the 1500 stocks below the largest 1000 US names, giving a
        # concentrated small/mid-cap illiquidity tilt with no explicit value screen.
        target_factors  = ["ILLIQ"],   # illiquidity is the *mechanism*, not a byproduct
        expected_signs  = {
            "MKT":   1,      # fully invested equity portfolio
            "HML":   1,      # fundamental weighting creates implicit value tilt
            "SMB":   1,      # universe is ~1500 small and mid-cap stocks
            "MOM":  -1,      # RAFI rebalancing buys recent losers / sells winners → contrarian
            "BAB":   None,
            "QMJ":  -1,      # illiquid/value stocks often score as "junk" in Asness (2019)
            "RMW":   None,
            "CARRY": None,
            "ILLIQ": 1,      # primary thesis: fundamental weighting harvests illiquidity premium
        },
        expense_ratio   = 0.0039,
    ),
    "IWN": ETFConfig(
        ticker          = "IWN",
        full_name       = "iShares Russell 2000 Value ETF",
        factor_strategy = "Illiquidity / Size / Value",
        # Russell 2000 Value stocks sit at the intersection of three risk premia:
        #   size (SMB), value (HML), and illiquidity (ILLIQ).  Small-cap value
        #   companies trade with the widest bid-ask spreads and lowest dollar
        #   volumes of any major index segment — the canonical illiquidity play.
        target_factors  = ["ILLIQ","SMB", "HML"],
        expected_signs  = {
            "MKT":  1,      # fully invested equity ETF
            "HML":  1,      # primary: deep value tilt (Russell 2000 Value screen)
            "SMB":  1,      # primary: pure small-cap universe (Russell 2000)
            "MOM":  None,   # value stocks can be momentum losers; no screen
            "BAB":  None,   # no explicit low-vol screen
            "QMJ":  -1,     # small-cap value often scores as "junk" in Asness (2019)
            "RMW":  None,   # small-cap value spans profitable and unprofitable firms
            "CARRY": None,  # equity-only, no FX exposure
            "ILLIQ": 1,     # positive: small-cap value = widest spreads, least dollar volume
        },
        expense_ratio   = 0.0024,
    ),
    "DBV": ETFConfig(
        ticker          = "DBV",
        full_name       = "Invesco DB G10 Currency Harvest Fund",
        factor_strategy = "Carry / FX",
        target_factors  = ["CARRY"],  # G10 FX carry (Koijen et al. 2018)
        expected_signs  = {
            "MKT": None, "HML": None, "SMB": None, "MOM": None,
            "BAB": None, "QMJ": None, "RMW": None,
            "CARRY": 1,  # positive: long high-yield, short low-yield currencies
            "ILLIQ": None,  # FX product; US equity illiquidity factor not applicable
        },
        expense_ratio   = 0.0075,
    ),
    "IWM": ETFConfig(
    ticker          = "IWM",
    full_name       = "iShares Russell 2000 ETF",
    factor_strategy = "Size / Small-Cap",
    target_factors  = ["SMB"],          # Small Minus Big (Fama-French 1993)
    expected_signs  = {
        "MKT":   1,     # positive: fully invested in equities
        "HML":   None,  # no deliberate value tilt
        "SMB":   1,     # positive: pure small-cap exposure — this is the thesis
        "MOM":   None,  # no momentum screen
        "BAB":   None,  # no low-vol screen
        "QMJ":   None,  # no quality screen
        "RMW":   None,  # small-caps skew unprofitable → may be mildly negative
        "CARRY": None,  # equity-only, no FX exposure
        "ILLIQ": 1,     # positive: small-caps are less liquid → earn illiquidity premium
    },
    expense_ratio   = 0.0019,
),
    "FXA": ETFConfig(
        ticker          = "FXA",
        full_name       = "Invesco CurrencyShares Australian Dollar Trust",
        factor_strategy = "FX Carry / AUD",
        target_factors  = ["CARRY"],    # AUD is a perennial high-yield G10 carry currency
        expected_signs  = {
            "MKT":   None,  # minor risk-on beta possible but not a primary driver
            "HML":   None,
            "SMB":   None,
            "MOM":   None,
            "BAB":   None,
            "QMJ":   None,
            "RMW":   None,
            "CARRY": 1,     # positive: AUD consistently in top-3 high-yield G10 currencies
            "ILLIQ": None,  # FX product; US equity illiquidity factor not applicable
        },
        expense_ratio   = 0.0040,
    ),
    "SPLV": ETFConfig(
        ticker          = "SPLV",
        full_name       = "Invesco S&P 500 Low Volatility ETF",
        factor_strategy = "Low Volatility",
        target_factors  = ["BAB"],      # holds the 100 lowest-vol S&P 500 stocks — pure BAB play
        expected_signs  = {
            "MKT":  1,      # positive but meaningfully below 1 (~0.6–0.7)
            "HML":  None,
            "SMB":  -1,     # large-cap bias: low-vol stocks skew large
            "MOM":  None,
            "BAB":  1,      # primary thesis: long low-beta / short high-beta
            "QMJ":  1,      # low-vol and quality often co-load
            "RMW":  None,
            "CARRY": None,
            "ILLIQ": -1,    # S&P 500 stocks are large-cap and liquid → negative IML loading
        },
        expense_ratio   = 0.0013,
    ),
    "SPHQ": ETFConfig(
        ticker          = "SPHQ",
        full_name       = "Invesco S&P 500 Quality ETF",
        factor_strategy = "Profitability / Quality",
        target_factors  = ["QMJ", "RMW"],
        # S&P Quality Score = ROE (→RMW) + accruals ratio (→growth/QMJ)
        # + financial leverage (→safety/QMJ).  All three QMJ pillars are
        # present, making (RMW+CMA)/2 a much better fit than for QUAL.
        expected_signs  = {
            "MKT":  1,
            "HML":  -1,     # quality firms skew growth (low book-to-market)
            "SMB":  -1,     # large-cap quality bias
            "MOM":  None,
            "BAB":  None,
            "QMJ":  1,      # primary: broad quality (profitability+safety+growth)
            "RMW":  1,      # supplementary: profitability leg
            "CARRY": None,
            "ILLIQ": -1,    # S&P 500 quality stocks are large-cap and liquid → negative IML loading
        },
        expense_ratio   = 0.0015,
    ),
    "XMLV": ETFConfig(
        ticker          = "XMLV",
        full_name       = "Invesco S&P MidCap Low Volatility ETF",
        factor_strategy = "Low Volatility / Mid-Cap",
        # Holds the 80 least-volatile stocks from the S&P 400 MidCap index,
        # weighted by inverse volatility.  Same methodology as SPLV but applied
        # one cap-tier lower.  Allows isolation of whether the low-vol anomaly
        # (BAB) persists in mid-cap names where leverage constraints on investors
        # are somewhat less binding than in micro/small-cap.
        # Expects a positive SMB loading (mid-cap vs S&P 500 large-cap benchmark)
        # but smaller than XSLV given the S&P 400 skews toward the upper size range.
        target_factors  = ["BAB"],
        expected_signs  = {
            "MKT":  1,      # fully invested equity portfolio
            "HML":  None,   # no explicit value screen; mid-cap low-vol is style-neutral
            "SMB":  1,      # positive: S&P 400 mid-caps sit above Russell 2000 but below S&P 500
            "MOM":  None,   # low-vol selection is orthogonal to momentum
            "BAB":  1,      # primary: inverse-vol weighting of lowest-vol mid-cap names
            "QMJ":  None,
            "RMW":  None,
            "CARRY": None,
            "ILLIQ": None,  # mid-caps are reasonably liquid; no directional illiquidity thesis
        },
        expense_ratio   = 0.0025,
    ),
    "XSLV": ETFConfig(
        ticker          = "XSLV",
        full_name       = "Invesco S&P SmallCap Low Volatility ETF",
        factor_strategy = "Low Volatility / Small-Cap",
        # Holds the 120 least-volatile stocks from the S&P 600 SmallCap index,
        # weighted by inverse volatility.  The small-cap universe means this ETF
        # sits at the intersection of two risk premia: BAB (low-vol anomaly) and
        # SMB (size premium).  Small-cap low-vol names also tend to be illiquid,
        # so a positive ILLIQ loading is expected as a secondary exposure.
        # Frazzini-Pedersen (2014) document that the BAB premium is strongest
        # in small-cap stocks, where leverage constraints on retail investors are
        # most binding — making XSLV the purest test of BAB in this universe.
        target_factors  = ["BAB"],
        expected_signs  = {
            "MKT":  1,      # fully invested equity portfolio
            "HML":  None,   # low-vol screen is orthogonal to value; no directional thesis
            "SMB":  1,      # positive: S&P 600 = pure small-cap universe
            "MOM":  None,   # low-vol and momentum are orthogonal
            "BAB":  1,      # primary: inverse-vol weighting concentrates low-beta small-caps
            "QMJ":  None,
            "RMW":  None,
            "CARRY": None,
            "ILLIQ": 1,     # secondary: small-cap low-vol names tend to be thinly traded
        },
        expense_ratio   = 0.0025,
    ),
}

# 9 real factors across the three sources described in the module docstring.
# RMW, CARRY, and ILLIQ may be NaN for some periods; regressions handle this gracefully.
FACTOR_LIST = ["MKT", "HML", "SMB", "MOM", "BAB", "QMJ", "RMW", "CARRY", "ILLIQ"]


# =============================================================================
# SECTION 1b — LIVE METADATA ENRICHMENT
# =============================================================================

def fetch_etf_metadata(configs: Dict[str, "ETFConfig"]) -> None:
    """
    Enrich ETFConfig objects in-place with live data from yfinance:
      - full_name     ← info["longName"]
      - expense_ratio ← info["annualReportExpenseRatio"] (or "expenseRatio")

    Falls back to hardcoded values for any ticker where the lookup fails.
    Sets config.metadata_source = "live" on success, "hardcoded" on failure.
    """
    try:
        import yfinance as yf
    except ImportError:
        log.warning("yfinance not installed — skipping metadata enrichment")
        return

    log.info("Fetching live ETF metadata (name + expense ratio) via yfinance...")
    for tkr, cfg in configs.items():
        try:
            info = yf.Ticker(tkr).info

            name = info.get("longName") or info.get("shortName")
            if name:
                cfg.full_name = name

            # yfinance exposes expense ratio under different keys depending on version
            er = (info.get("annualReportExpenseRatio")
                  or info.get("totalExpenseRatio")
                  or info.get("expenseRatio"))
            if er is not None and 0 < er < 1:   # sanity: must be a decimal fraction
                cfg.expense_ratio = float(er)

            cfg.metadata_source = "live"
            log.info("  %-6s  name=%-52s  ER=%.4f%%", tkr, cfg.full_name,
                     cfg.expense_ratio * 100)

        except Exception as exc:
            log.warning("  %-6s  metadata lookup failed (%s) — using hardcoded values", tkr, exc)
            cfg.metadata_source = "hardcoded"

OUTPUT_DIR = Path(__file__).parent / "gs_smartbeta_output"
OUTPUT_DIR.mkdir(exist_ok=True)


# =============================================================================
# SECTION 2 — DATA LAYER (live only)
# =============================================================================

class DataLoader:
    """
    Fetches factor data and ETF prices.

    Factor pipeline
    ---------------
    1. pandas_datareader → Ken French "F-F_Research_Data_Factors"
       MKT (Mkt-RF), SMB, HML, RF  — monthly, percent ÷ 100 → decimal

    2. pandas_datareader → Ken French "F-F_Momentum_Factor"
       MOM — monthly, percent ÷ 100 → decimal

    PeriodIndex("M") from Ken French is converted to month-end DatetimeIndex
    to align with yfinance resample("ME") dates.
    """

    def __init__(self):
        log.info("DataLoader initialised | sources: Ken French (direct) + FRED + yfinance")

    def load(self) -> Tuple[pd.DataFrame, Dict[str, pd.Series]]:
        """Returns (factor_df, {ticker: monthly_excess_return_series})."""
        factors  = self._build_factor_frame()
        etf_data = self._fetch_etf_returns(factors)
        log.info(
            "Data ready | %d months (%s – %s) | factors: %s",
            len(factors),
            factors.index[0].strftime("%Y-%m"),
            factors.index[-1].strftime("%Y-%m"),
            [c for c in factors.columns if c != "RF"],
        )
        return factors, etf_data

    # ── private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _fetch_french(name: str, start_dt, end_dt) -> pd.DataFrame:
        """
        Download and parse a Ken French data library CSV dataset directly,
        without pandas_datareader (incompatible with Python 3.12+).

        File format (confirmed from inspection):
          - Comma-separated
          - Header line starts with ',' (empty index-column name)
          - Data rows: first field = 6-digit YYYYMM integer
          - Monthly block ends at the first blank line (annual data follows)
          - Values are in percent → divided by 100 on return
        """
        import requests, zipfile, io as _io

        url = (
            "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
            f"{name}_CSV.zip"
        )
        log.info("Fetching Ken French dataset | %s", name)
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()

        with zipfile.ZipFile(_io.BytesIO(resp.content)) as z:
            fname = next(
                f for f in z.namelist()
                if not f.startswith("_") and not f.startswith(".")
            )
            raw = z.read(fname).decode("latin-1")

        lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")

        # ── Locate header and monthly data block ──────────────────────────
        # Header line: starts with ',' (empty index field)
        # Data row   : first CSV field is a 6-digit YYYYMM integer
        hdr_idx    = None
        data_start = None

        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            first_field = stripped.split(",")[0].strip()
            if first_field == "":                          # header: ',Col1,Col2,...'
                hdr_idx = i
            elif first_field.isdigit() and len(first_field) == 6:
                data_start = i
                break                                      # stop at first data row

        if data_start is None:
            raise ValueError(f"No monthly data found in {name}")

        # Monthly block ends at the first blank line after data starts
        data_end = data_start
        while data_end < len(lines) and lines[data_end].strip():
            data_end += 1

        # ── Parse ─────────────────────────────────────────────────────────
        if hdr_idx is not None:
            block = "\n".join([lines[hdr_idx]] + lines[data_start:data_end])
        else:
            block = "\n".join(lines[data_start:data_end])

        df = pd.read_csv(_io.StringIO(block), index_col=0,
                         na_values=["-99.99", "-999"])
        df.index = (
            pd.to_datetime(df.index.astype(str).str.strip(), format="%Y%m")
            + pd.offsets.MonthEnd(0)
        )
        df.columns = [c.strip() for c in df.columns]
        df = df.apply(pd.to_numeric, errors="coerce") / 100  # percent → decimal

        start = pd.Timestamp(start_dt)
        end   = pd.Timestamp(end_dt)
        return df.loc[(df.index >= start) & (df.index <= end)]

    def _build_factor_frame(self) -> pd.DataFrame:
        """
        Assemble the 8-factor DataFrame entirely from Ken French data library
        (direct download) + FRED/yfinance for CARRY.  No pandas_datareader,
        no AQR dependency.
        """
        end_dt   = datetime.today()
        start_dt = end_dt - pd.DateOffset(years=15)

        # ── FF3: MKT, SMB, HML, RF ────────────────────────────────────────
        log.info("Loading FF3 factors (Ken French direct download)")
        ff3 = self._fetch_french("F-F_Research_Data_Factors", start_dt, end_dt)

        # ── Momentum ──────────────────────────────────────────────────────
        log.info("Loading Momentum factor (Ken French direct download)")
        mom_raw = self._fetch_french("F-F_Momentum_Factor", start_dt, end_dt)
        mom_col = next(c for c in mom_raw.columns if "Mom" in c or "UMD" in c or "WML" in c)

        factors = pd.DataFrame({
            "MKT": ff3["Mkt-RF"],
            "SMB": ff3["SMB"],
            "HML": ff3["HML"],
            "MOM": mom_raw[mom_col],
            "RF" : ff3["RF"],
        })

        # ── FF5: RMW (profitability) + CMA (investment) ───────────────────
        log.info("Loading FF5 factors (Ken French direct download)")
        ff5 = self._fetch_french("F-F_Research_Data_5_Factors_2x3", start_dt, end_dt)

        rmw = pd.Series(ff5["RMW"].values, index=ff5.index, name="RMW")
        factors = factors.join(rmw, how="left")

        # ── QMJ proxy = (RMW + CMA) / 2 ──────────────────────────────────
        cma = pd.Series(ff5["CMA"].values, index=ff5.index, name="CMA")
        qmj_proxy = ((rmw + cma) / 2).rename("QMJ")
        factors = factors.join(qmj_proxy, how="left")
        log.info("QMJ proxy = (RMW + CMA) / 2  |  source: Ken French FF5")

        # ── BAB proxy: Lo20%% beta − Hi20%% beta (Ken French) ────────────
        log.info("Loading beta-sorted portfolios for BAB proxy (Ken French direct download)")
        try:
            beta_raw = self._fetch_french("Portfolios_Formed_on_BETA", start_dt, end_dt)
            # File contains both quintile (Lo 20 / Hi 20) and decile (Lo 10 / Hi 10)
            # columns. Use the quintile pair for a cleaner 5-portfolio sort.
            lo_col = next(c for c in beta_raw.columns if "Lo 20" in c or c == "Lo 20")
            hi_col = next(c for c in beta_raw.columns if "Hi 20" in c or c == "Hi 20")
            bab_proxy = (beta_raw[lo_col] - beta_raw[hi_col]).rename("BAB")
            factors = factors.join(bab_proxy, how="left")
            log.info("BAB proxy | lo='%s' hi='%s' | source: Ken French", lo_col, hi_col)
        except Exception as exc:
            log.warning("BAB proxy construction failed (%s) — BAB set to NaN", exc)
            factors["BAB"] = float("nan")

        # ── CARRY from FRED + yfinance ─────────────────────────────────────
        carry = self._fetch_carry()
        factors = factors.join(carry, how="left") if not carry.empty \
            else factors.assign(CARRY=float("nan"))

        # ── ILLIQ: Amihud (2002) IML from yfinance daily OHLCV ────────────
        illiq = self._fetch_illiquidity()
        factors = factors.join(illiq, how="left") if not illiq.empty \
            else factors.assign(ILLIQ=float("nan"))

        factors = factors.sort_index().dropna(subset=["MKT", "SMB"])
        log.info(
            "Factor frame ready | %d months (%s – %s) | factors: %s",
            len(factors),
            factors.index[0].strftime("%Y-%m"),
            factors.index[-1].strftime("%Y-%m"),
            [c for c in factors.columns if c != "RF"],
        )
        return factors

    # ── CARRY: FRED 3M rates + yfinance FX spots ──────────────────────────

    def _fetch_carry(self) -> pd.Series:
        """
        Construct G10 FX carry factor from FRED 3-month rates + yfinance FX.

        Signal  : rate differential vs USD (annual %) — used for ranking only
        Weights : long top-3 high-yield / short bottom-3 low-yield currencies
        Return  : full carry return = monthly FX spot return (USD-normalised)
                  + monthly interest rate differential (annual% / 12 / 100)

        Quote normalisation
        -------------------
        EUR, GBP, AUD, NZD : naturally quoted as USD per 1 foreign unit — no change
        JPY, CAD, CHF, NOK, SEK : quoted as foreign per 1 USD (inverted) — take
            reciprocal so all series are on a consistent "USD per 1 foreign" basis
            before computing pct_change().  A rising value always means the foreign
            currency appreciated.
        """
        try:
            import requests as _req
            import yfinance as yf

            RATE_SERIES = {
                "USD": "DTB3",
                "EUR": "IR3TIB01EZM156N",
                "GBP": "IR3TIB01GBM156N",
                "JPY": "IR3TIB01JPM156N",
                "AUD": "IR3TIB01AUM156N",
                "CAD": "IR3TIB01CAM156N",
                "CHF": "IR3TIB01CHM156N",
                "NZD": "IR3TIB01NZM156N",
                "NOK": "IR3TIB01NOM156N",
                "SEK": "IR3TIB01SEM156N",
            }
            FX_TICKERS = {
                "EUR": "EURUSD=X", "GBP": "GBPUSD=X", "JPY": "JPY=X",
                "AUD": "AUDUSD=X", "CAD": "CAD=X",    "CHF": "CHF=X",
                "NZD": "NZDUSD=X", "NOK": "NOK=X",    "SEK": "SEK=X",
            }
            # Currencies quoted as "foreign per 1 USD" — must invert to get
            # "USD per 1 foreign" so that pct_change() gives USD returns
            INVERTED_QUOTES = {"JPY", "CAD", "CHF", "NOK", "SEK"}

            # ── FRED rates via direct API (no pandas_datareader) ──────────
            log.info("Fetching G10 3M rates from FRED (direct API)")
            fred_base = "https://fred.stlouisfed.org/graph/fredgraph.csv"

            def _fred_series(series_id: str) -> pd.Series:
                r = _req.get(
                    fred_base,
                    params={"id": series_id, "vintage_date": "2000-01-01"},
                    timeout=30,
                )
                r.raise_for_status()
                import io as _io
                s = pd.read_csv(_io.StringIO(r.text), index_col=0,
                                parse_dates=True, na_values=".")
                return s.iloc[:, 0].dropna()

            rates = pd.DataFrame({
                ccy: _fred_series(series)
                for ccy, series in RATE_SERIES.items()
            })
            rates = rates.resample("ME").last()

            log.info("Fetching G10 FX spot rates from yfinance")
            fx_raw = yf.download(
                list(FX_TICKERS.values()), period="max",
                interval="1mo", progress=False,
            )["Close"]
            # yfinance returns columns sorted alphabetically by ticker symbol,
            # NOT in the order requested — use reverse mapping to rename safely.
            ticker_to_ccy = {v: k for k, v in FX_TICKERS.items()}
            fx_raw = fx_raw.rename(columns=ticker_to_ccy)
            fx_raw.index = fx_raw.index + pd.offsets.MonthEnd(0)

            # ── Normalise all quotes to "USD per 1 foreign unit" ──────────
            fx_normalised = fx_raw.copy()
            for ccy in INVERTED_QUOTES:
                if ccy in fx_normalised.columns:
                    fx_normalised[ccy] = 1.0 / fx_normalised[ccy]
            fx_spot_returns = fx_normalised.pct_change()

            # Carry signal = foreign rate minus USD rate (annual %)
            carry_signal = rates.drop(columns="USD").subtract(rates["USD"], axis=0)

            # Monthly rate differential: FRED rates are annual %, convert to
            # monthly decimal so it is on the same scale as spot returns
            rate_diff_monthly = carry_signal / 100.0 / 12.0

            common = carry_signal.index.intersection(fx_spot_returns.index)
            carry_signal      = carry_signal.loc[common].dropna(how="all")
            fx_spot_returns   = fx_spot_returns.loc[common]
            rate_diff_monthly = rate_diff_monthly.loc[common]

            # Full carry return = spot appreciation + interest earned
            total_returns = fx_spot_returns.add(rate_diff_monthly, fill_value=0)

            def _carry_portfolio(signal, total_ret, n=3):
                rankings = signal.rank(axis=1, ascending=False)
                longs    = (rankings <= n).astype(float)
                shorts   = (rankings >= len(signal.columns) - n + 1).astype(float)
                weights  = (longs - shorts).div(
                    (longs + shorts).sum(axis=1), axis=0)
                return (weights * total_ret).sum(axis=1)

            carry = _carry_portfolio(carry_signal, total_returns).dropna()
            carry.index = carry.index + pd.offsets.MonthEnd(0)
            log.info(
                "CARRY factor ready | %d months (%s – %s) | FRED + yfinance"
                " | full return (spot + rate differential)",
                len(carry),
                carry.index[0].strftime("%Y-%m"),
                carry.index[-1].strftime("%Y-%m"),
            )
            return carry.rename("CARRY")

        except Exception as exc:
            log.warning("CARRY fetch failed (%s) — CARRY set to NaN", exc)
            return pd.Series(dtype=float, name="CARRY")

    # ── ILLIQ: Amihud (2002) IML factor ───────────────────────────────────

    def _fetch_illiquidity(self) -> pd.Series:
        """
        Construct Amihud (2002) Illiquidity factor: IML (Illiquid Minus Liquid).

        Methodology
        -----------
        1. Universe: curated 30-stock panel — 15 large-cap (liquid) + 15 small-cap
           (illiquid) US stocks with continuous listing over the sample period.
        2. For each stock i and month m:
               ILLIQ_i,m = mean_d( |R_i,d| / (Price_i,d × Volume_i,d) )
           where d indexes trading days within month m.
        3. Sort stocks each month into terciles by prior-month ILLIQ
           (no look-ahead bias).
        4. IML_m = equal-weighted return of top-tercile (most illiquid) stocks
                 − equal-weighted return of bottom-tercile (most liquid) stocks.

        Caveats
        -------
        - Fixed universe introduces survivorship bias toward firms that survived
          the full sample period.  Suitable for factor-exposure analysis only.
        - ILLIQ is positively correlated with SMB; coefficient inflation from
          multicollinearity is expected for broad equity ETFs.
        """
        try:
            import yfinance as yf

            # 15 large-cap liquid stocks (S&P 100 tier, all listed since ~2000)
            LIQUID_TICKERS = [
                "AAPL", "MSFT", "AMZN", "GOOGL", "JPM",
                "JNJ",  "PG",   "KO",   "WMT",   "BAC",
                "CVX",  "HD",   "CSCO", "INTC",  "VZ",
            ]
            # 15 small/mid-cap less-liquid stocks (all listed since ~2010)
            ILLIQUID_TICKERS = [
                "LANC", "CBSH", "EXPO", "FELE", "MGEE",
                "MLAB", "CASS", "SKYW", "NBTB", "ASGN", 
                "HCI",  "CATO", "UFPI", "SRCE", "NHC",
            ]
            all_tickers = LIQUID_TICKERS + ILLIQUID_TICKERS

            end_dt   = datetime.today()
            start_dt = end_dt - pd.DateOffset(years=15)

            log.info(
                "Fetching daily OHLCV for Amihud IML universe (%d stocks)", len(all_tickers)
            )
            raw = yf.download(
                all_tickers,
                start=start_dt.strftime("%Y-%m-%d"),
                end=end_dt.strftime("%Y-%m-%d"),
                interval="1d",
                auto_adjust=True,
                progress=False,
            )

            if isinstance(raw.columns, pd.MultiIndex):
                close  = raw["Close"]
                volume = raw["Volume"]
            else:
                close  = raw[["Close"]]
                volume = raw[["Volume"]]

            # Daily Amihud ratio: |return| / dollar_volume
            ret_daily    = close.pct_change()
            dollar_vol   = close * volume
            amihud_daily = ret_daily.abs() / dollar_vol.replace(0, float("nan"))

            # Monthly aggregation: mean of daily Amihud within each calendar month
            amihud_monthly = amihud_daily.resample("ME").mean()
            close_monthly  = close.resample("ME").last()
            ret_monthly    = close_monthly.pct_change()

            # Build IML: each month sort on prior-month ILLIQ to avoid look-ahead bias
            dates = amihud_monthly.index.intersection(ret_monthly.index)
            iml_records = []

            for i in range(1, len(dates)):
                date      = dates[i]
                prev_date = dates[i - 1]

                illiq_prev = amihud_monthly.loc[prev_date].dropna()
                ret_now    = ret_monthly.loc[date]

                # Require at least 6 stocks with valid Amihud and return data
                valid = illiq_prev.index.intersection(ret_now.dropna().index)
                if len(valid) < 6:
                    continue

                illiq_valid  = illiq_prev[valid].sort_values()
                n_group      = max(2, len(illiq_valid) // 3)
                liquid_stk   = illiq_valid.index[:n_group]    # bottom tercile: most liquid
                illiquid_stk = illiq_valid.index[-n_group:]   # top tercile: most illiquid

                liq_ret   = ret_now[liquid_stk].mean()
                illiq_ret = ret_now[illiquid_stk].mean()

                if not (np.isnan(liq_ret) or np.isnan(illiq_ret)):
                    iml_records.append({"date": date, "ILLIQ": illiq_ret - liq_ret})

            if not iml_records:
                raise ValueError("No valid IML observations could be constructed")

            iml = (
                pd.DataFrame(iml_records)
                .set_index("date")["ILLIQ"]
                .sort_index()
            )
            iml.index = iml.index + pd.offsets.MonthEnd(0)
            log.info(
                "ILLIQ (IML) factor ready | %d months (%s – %s) | Amihud (2002)",
                len(iml),
                iml.index[0].strftime("%Y-%m"),
                iml.index[-1].strftime("%Y-%m"),
            )
            return iml

        except Exception as exc:
            log.warning("ILLIQ fetch failed (%s) — ILLIQ set to NaN", exc)
            return pd.Series(dtype=float, name="ILLIQ")

    def _fetch_etf_returns(self, factors: pd.DataFrame) -> Dict[str, pd.Series]:
        """Download ETF prices and return excess-return series aligned to factor index."""
        try:
            import yfinance as yf
        except ImportError:
            raise ImportError("pip install yfinance")

        tickers  = list(ETF_CONFIGS.keys())
        end_dt   = datetime.today()
        start_dt = end_dt - pd.DateOffset(years=15)

        log.info("Fetching ETF prices via yfinance | tickers=%s", tickers)
        raw = yf.download(
            tickers, start=start_dt.strftime("%Y-%m-%d"),
            end=end_dt.strftime("%Y-%m-%d"),
            auto_adjust=True, progress=False,
        )
        etf_px      = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        etf_monthly = etf_px.resample("ME").last()
        etf_ret_raw = etf_monthly.pct_change()

        common = etf_ret_raw.index.intersection(factors.index)
        rf     = factors.loc[common, "RF"]

        etf_data: Dict[str, pd.Series] = {}
        for tkr in tickers:
            if tkr not in etf_ret_raw.columns:
                raise RuntimeError(f"No price data returned for {tkr}")
            col = etf_ret_raw[tkr].loc[common]
            if col.notna().sum() < 30:
                raise RuntimeError(f"Insufficient data for {tkr} ({col.notna().sum()} months)")
            etf_data[tkr] = (col - rf).rename(tkr)

        return etf_data


# =============================================================================
# SECTION 3 — ANALYTICS (CHECKS 1 & 2)
# =============================================================================

@dataclass
class RegressionResult:
    ticker      : str
    alpha       : float
    alpha_se    : float
    alpha_tstat : float
    alpha_pval  : float
    betas       : Dict[str, float]
    beta_se     : Dict[str, float]
    beta_tstats : Dict[str, float]
    beta_pvals  : Dict[str, float]
    r_squared   : float
    adj_r2      : float
    n_obs       : int


ROLLING_WINDOW = 36   # months
MIN_OBS        = 24
SIGNIFICANCE   = 0.05


def run_factor_regression(ret: pd.Series, factors: pd.DataFrame,
                          config: ETFConfig) -> RegressionResult:
    """
    Check 1 — Full-sample OLS with Newey-West HAC SEs (optimal lag).
    R_etf = α + β_MKT·MKT + β_SMB·SMB + β_HML·HML + β_MOM·MOM
              + β_BAB·BAB + β_QMJ·QMJ + β_RMW·RMW + β_CARRY·CARRY + ε

    Lag length follows the Newey-West formula: ceil(4*(N/100)^(2/9)).
    Only includes factors that have at least 24 non-NaN observations
    in the aligned sample to avoid losing data through listwise deletion.
    """
    common = ret.index.intersection(factors.index)

    # BAB creates near-collinearity with MKT for generic equity ETFs, flipping
    # the market coefficient negative.  Include it only when BAB is the ETF's
    # explicit target factor (low-vol ETFs), where estimating BAB cleanly
    # matters more than preserving an unbiased MKT coefficient.
    bab_targeted = "BAB" in config.target_factors
    available = [
        f for f in FACTOR_LIST
        if (f != "BAB" or bab_targeted)
        and f in factors.columns
        and factors.loc[common, f].notna().sum() >= 24
    ]

    df    = pd.concat([ret.loc[common], factors.loc[common, available]], axis=1).dropna()
    y     = df.iloc[:, 0].values
    X     = add_constant(df.iloc[:, 1:].values, has_constant="add")
    nw_lags = max(1, int(np.ceil(4 * (len(y) / 100) ** (2 / 9))))
    model = OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": nw_lags})

    param_names = ["alpha"] + available
    params = dict(zip(param_names, model.params))
    se     = dict(zip(param_names, model.bse))
    tstats = dict(zip(param_names, model.tvalues))
    pvals  = dict(zip(param_names, model.pvalues))

    # Fill results for any factor not in this regression with NaN
    nan = float("nan")
    return RegressionResult(
        ticker      = config.ticker,
        alpha       = params["alpha"],
        alpha_se    = se["alpha"],
        alpha_tstat = tstats["alpha"],
        alpha_pval  = pvals["alpha"],
        betas       = {f: params.get(f, nan) for f in FACTOR_LIST},
        beta_se     = {f: se.get(f, nan)     for f in FACTOR_LIST},
        beta_tstats = {f: tstats.get(f, nan) for f in FACTOR_LIST},
        beta_pvals  = {f: pvals.get(f, nan)  for f in FACTOR_LIST},
        r_squared   = model.rsquared,
        adj_r2      = model.rsquared_adj,
        n_obs       = int(model.nobs),
    )


def run_rolling_regression(ret: pd.Series, factors: pd.DataFrame,
                           config: ETFConfig) -> pd.DataFrame:
    """
    Check 2 — Rolling 36-month OLS windows with Newey-West HAC SEs.
    Returns DataFrame of rolling beta + p-value estimates indexed by date.
    Stability criterion: target factor β significant in >80% of windows.

    Uses only factors available in the DataFrame; factors that are all-NaN
    in a given window are silently excluded from that window's regression.
    BAB is included only for ETFs that target it (see run_factor_regression).
    Lag length follows the Newey-West formula: ceil(4*(N/100)^(2/9)).
    """
    common = ret.index.intersection(factors.index)
    bab_targeted = "BAB" in config.target_factors
    available = [
        f for f in FACTOR_LIST
        if (f != "BAB" or bab_targeted)
        and f in factors.columns
        and factors.loc[common, f].notna().sum() >= 24
    ]
    df_full = pd.concat([ret.loc[common], factors.loc[common, available]], axis=1)
    df_     = df_full.dropna()
    n_dropped = len(df_full) - len(df_)
    if n_dropped:
        log.warning(
            "[%s] Rolling regression: %d/%d months dropped due to NaN factors "
            "(CARRY/ILLIQ gaps); effective window covers %s–%s",
            config.ticker, n_dropped, len(df_full),
            df_.index[0].strftime("%Y-%m"), df_.index[-1].strftime("%Y-%m"),
        )
    ret_ = df_.iloc[:, 0]
    fac_ = df_.iloc[:, 1:]
    records = []

    for end_idx in range(ROLLING_WINDOW, len(df_) + 1):
        start_idx = end_idx - ROLLING_WINDOW
        y_w = ret_.iloc[start_idx:end_idx].values
        X_w = add_constant(fac_.iloc[start_idx:end_idx].values)
        if len(y_w) < MIN_OBS:
            continue
        try:
            nw_lags = max(1, int(np.ceil(4 * (len(y_w) / 100) ** (2 / 9))))
            res = OLS(y_w, X_w).fit(cov_type="HAC", cov_kwds={"maxlags": nw_lags})
            row = {"date": df_.index[end_idx - 1], "alpha": res.params[0]}
            for i, f in enumerate(available):
                row[f]            = res.params[i + 1]
                row[f"_pval_{f}"] = res.pvalues[i + 1]
            records.append(row)
        except Exception:
            continue

    return pd.DataFrame(records).set_index("date")


# =============================================================================
# SECTION 4 — CONSOLE OUTPUT
# =============================================================================

def _sig(p: float) -> str:
    return "***" if p < 0.01 else "**" if p < 0.05 else "*" if p < 0.10 else ""


def print_regression_table(reg: RegressionResult):
    print(f"\n{'─'*78}")
    print(f"  CHECK 1 — FACTOR REGRESSION  {reg.ticker}"
          f"  (N={reg.n_obs}, R²={reg.r_squared:.3f}, adj-R²={reg.adj_r2:.3f})")
    print(f"  Sources: AQR6 (MKT/SMB/HML/MOM/BAB/QMJ) | FF5 (RMW) | Koijen/AQR (CARRY)")
    print(f"{'─'*78}")

    rows = [["alpha", f"{reg.alpha:.4f}", f"{reg.alpha_se:.4f}",
             f"{reg.alpha_tstat:.2f}", f"{reg.alpha_pval:.4f}", _sig(reg.alpha_pval)]]
    for f in FACTOR_LIST:
        b = reg.betas[f]
        if np.isnan(b):
            rows.append([f, "n/a", "n/a", "n/a", "n/a", "(not in sample)"])
        else:
            rows.append([f, f"{b:.4f}", f"{reg.beta_se[f]:.4f}",
                         f"{reg.beta_tstats[f]:.2f}", f"{reg.beta_pvals[f]:.4f}",
                         _sig(reg.beta_pvals[f])])

    print(tabulate(rows, headers=["Factor", "Coef.", "Std.Err", "t-stat", "p-value", "Sig."],
                   tablefmt="simple"))
    print("Significance: * p<0.10  ** p<0.05  *** p<0.01  (HAC robust SE, 6 lags)\n")


def print_stability_summary(ticker: str, config: ETFConfig, rolling: pd.DataFrame):
    print(f"  CHECK 2 — ROLLING STABILITY  {ticker}  (window={ROLLING_WINDOW}M)")
    rows = []
    for tf in config.target_factors:
        pvc = f"_pval_{tf}"
        if pvc in rolling.columns:
            pct  = (rolling[pvc] < SIGNIFICANCE).mean()
            flag = "✓ STABLE" if pct >= 0.80 else "⚠ UNSTABLE" if pct >= 0.50 else "✗ WEAK"
            rows.append([tf, f"{pct:.0%}", flag])
        else:
            rows.append([tf, "N/A", "— factor not in regression"])
    print(tabulate(rows, headers=["Target Factor", "% Windows Sig.", "Verdict"],
                   tablefmt="simple"))
    print()


# =============================================================================
# SECTION 5 — CHARTS
# =============================================================================

GS_BLUE  = "#0033A0"
GS_GRAY  = "#5A6069"
GS_GREEN = "#2E7D32"
GS_RED   = "#C62828"
GS_GOLD  = "#F9A825"


def plot_dashboard(results: Dict[str, Tuple[RegressionResult, pd.DataFrame]],
                   etf_configs: Dict[str, ETFConfig],
                   etf_data: Dict[str, pd.Series],
                   factors: pd.DataFrame):
    """
    Four-panel row per ETF:
      A — factor loading bar chart (Check 1)
      B — rolling target-factor beta + significance overlay (Check 2)
      C — cumulative return vs market (wealth index, base=1)
      D — IR + verdict scorecard
    """
    sns.set_theme(style="whitegrid", palette="muted", font_scale=0.9)
    plt.rcParams.update({"font.family": "DejaVu Sans", "figure.dpi": 150})

    n_etf = len(results)
    fig   = plt.figure(figsize=(22, n_etf * 3.8))
    fig.suptitle(
        "GS QIS — Factor Regression & Rolling Stability  (Checks 1 & 2)"
        "   |   Factors: AQR6 + FF5 RMW + Koijen/AQR Carry",
        fontsize=11, fontweight="bold", color=GS_BLUE, y=0.998,
    )
    outer = plt.GridSpec(n_etf, 1, figure=fig, hspace=0.60)

    for row_idx, (tkr, (reg, rolling)) in enumerate(results.items()):
        cfg   = etf_configs[tkr]
        inner = matplotlib.gridspec.GridSpecFromSubplotSpec(1, 4, subplot_spec=outer[row_idx],
                                            wspace=0.40, width_ratios=[1, 1.6, 1, 0.85])

        # ── Panel A: Factor Loadings (Check 1) ───────────────────────────
        ax_a = fig.add_subplot(inner[0])
        # Only plot factors that were actually estimated (non-NaN)
        plot_factors = [f for f in FACTOR_LIST if not np.isnan(reg.betas.get(f, float("nan")))]
        betas  = [reg.betas[f] for f in plot_factors]
        pvs    = [reg.beta_pvals[f] for f in plot_factors]
        colors = [
            GS_BLUE  if (f in cfg.target_factors and p < SIGNIFICANCE) else
            GS_GREEN if p < SIGNIFICANCE else
            GS_GRAY
            for f, p in zip(plot_factors, pvs)
        ]
        ax_a.barh(plot_factors, betas, color=colors, height=0.55)
        ax_a.axvline(0, color="black", lw=0.8)
        ax_a.set_title(f"{tkr} — Factor Loadings\n(blue=target  green=sig  grey=insig)",
                       fontsize=8)
        ax_a.set_xlabel("β (HAC-robust)", fontsize=7)
        ax_a.tick_params(labelsize=7)

        for tf in cfg.target_factors:
            if tf in plot_factors and not np.isnan(reg.betas.get(tf, float("nan"))):
                b = reg.betas[tf]
                ax_a.text(b + 0.01 * np.sign(b) if b != 0 else 0.01,
                          plot_factors.index(tf),
                          f"β={b:.2f}", va="center", fontsize=6,
                          color=GS_BLUE, fontweight="bold")

        # ── Panel B: Rolling Beta (Check 2) ──────────────────────────────
        ax_b = fig.add_subplot(inner[1])
        tfacs = [f for f in cfg.target_factors if f in rolling.columns]

        if tfacs:
            tf  = tfacs[0]
            rb  = rolling[tf]
            ax_b.plot(rolling.index, rb, color=GS_BLUE, lw=1.5, label=tf)
            ax_b.axhline(0, color="black", lw=0.7, ls="--")
            ax_b.fill_between(rolling.index, rb, 0,
                              where=rb > 0, alpha=0.12, color=GS_BLUE)
            pvc = f"_pval_{tf}"
            if pvc in rolling.columns:
                insig = rolling[rolling[pvc] > SIGNIFICANCE].index
                if len(insig):
                    ax_b.scatter(insig, rolling.loc[insig, tf],
                                 color=GS_RED, s=10, zorder=5,
                                 label=f"insig (p>{SIGNIFICANCE})")
                pct_sig = (rolling[pvc] < SIGNIFICANCE).mean()
                verdict = "STABLE ✓" if pct_sig >= 0.80 else "UNSTABLE ⚠"
                ax_b.set_title(
                    f"Rolling {ROLLING_WINDOW}M β ({tf})  —  "
                    f"{pct_sig:.0%} windows sig  [{verdict}]",
                    fontsize=8,
                )
            ax_b.legend(fontsize=6)
        else:
            ax_b.set_title(f"Rolling {ROLLING_WINDOW}M β — target factor not in FF universe",
                           fontsize=8)

        ax_b.tick_params(labelsize=7)
        ax_b.set_ylabel("β", fontsize=7)

        # ── Panel C: Cumulative Return vs Market ──────────────────────────
        ax_c = fig.add_subplot(inner[2])
        common = etf_data[tkr].index.intersection(factors.index)
        rf     = factors.loc[common, "RF"]
        mkt    = factors.loc[common, "MKT"] + rf   # excess → total return
        etf    = etf_data[tkr].loc[common]  + rf   # excess → total return
        cum_e  = (1 + etf).cumprod()
        cum_m  = (1 + mkt).cumprod()
        ax_c.plot(common, cum_e, color=GS_BLUE, lw=1.5, label=tkr)
        ax_c.plot(common, cum_m, color=GS_GRAY, lw=1.0,
                  ls="--", alpha=0.8, label="MKT")
        ax_c.set_title("Cumulative Return\nvs Market", fontsize=8)
        ax_c.legend(fontsize=6)
        ax_c.tick_params(labelsize=7)
        ax_c.set_ylabel("USD (base=1)", fontsize=7)

        # ── Panel D: IR + Verdict Scorecard ──────────────────────────────
        ax_d = fig.add_subplot(inner[3])
        ax_d.axis("off")

        # Information Ratio: mean(active) / std(active) * sqrt(12), annualised
        # active return = ETF excess return − target factor return
        tf_ir   = cfg.target_factors[0] if cfg.target_factors else None
        if tf_ir and tf_ir in factors.columns:
            common_ir = etf_data[tkr].index.intersection(factors.index)
            active    = etf_data[tkr].loc[common_ir] - factors.loc[common_ir, tf_ir]
            ir        = float(active.mean() / active.std()) * np.sqrt(12)
        else:
            ir = float("nan")

        # Verdict: PASS / WARN / FAIL
        alpha_pos  = reg.alpha > 0
        alpha_sig  = reg.alpha_pval < SIGNIFICANCE
        tf_b       = reg.betas.get(tf_ir, float("nan")) if tf_ir else float("nan")
        tf_p       = reg.beta_pvals.get(tf_ir, float("nan")) if tf_ir else float("nan")
        exp_sign   = cfg.expected_signs.get(tf_ir) if tf_ir else None
        sign_ok    = (exp_sign is None) or (not np.isnan(tf_b) and np.sign(tf_b) == exp_sign)
        tf_sig     = (not np.isnan(tf_p)) and tf_p < SIGNIFICANCE and sign_ok
        pvc        = f"_pval_{tf_ir}" if tf_ir else None
        pct_stab   = (rolling[pvc] < SIGNIFICANCE).mean() if (pvc and pvc in rolling.columns) else float("nan")
        stab_pass  = (not np.isnan(pct_stab)) and pct_stab >= 0.80

        if alpha_pos and alpha_sig and tf_sig and stab_pass:
            verdict = "PASS ✓"
            v_color = GS_GREEN
        elif alpha_pos and (tf_sig or alpha_sig):
            verdict = "WARN ⚠"
            v_color = GS_GOLD
        else:
            verdict = "FAIL ✗"
            v_color = GS_RED

        stab_str = f"{pct_stab:.0%}" if not np.isnan(pct_stab) else "N/A"
        ir_str   = f"{ir:.2f}"       if not np.isnan(ir)        else "N/A"
        scorecard = (
            f"{'─'*26}\n"
            f"  {tkr} — {cfg.factor_strategy}\n"
            f"{'─'*26}\n"
            f"  Verdict  : {verdict}\n"
            f"  α (ann.) : {reg.alpha * 12:.2%}\n"
            f"  α p-val  : {reg.alpha_pval:.3f}\n"
            f"  R²       : {reg.r_squared:.3f}\n"
            f"  IR       : {ir_str}\n"
            f"  Stability: {stab_str}\n"
            f"  Exp.Ratio: {cfg.expense_ratio:.2%}\n"
            f"{'─'*26}\n"
        )
        ax_d.text(0.05, 0.95, scorecard, transform=ax_d.transAxes,
                  fontsize=7, verticalalignment="top",
                  fontfamily="monospace",
                  bbox=dict(facecolor="white", edgecolor=v_color, lw=1.5,
                            boxstyle="round,pad=0.4"))

    path = OUTPUT_DIR / "checks_comprehensive_dashboard.png"
    fig.savefig(path, bbox_inches="tight", dpi=150)
    plt.close(fig)
    log.info("Dashboard saved → %s", path)
    return path


def plot_factor_correlation_heatmap(factors: pd.DataFrame):
    """Factor return correlation matrix — essential for multi-collinearity check."""
    fac_cols = [f for f in FACTOR_LIST if f != "RF"]
    corr     = factors[fac_cols].corr()

    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="RdBu_r",
                center=0, vmin=-1, vmax=1,
                linewidths=0.5, ax=ax,
                annot_kws={"size": 8})
    ax.set_title("Factor Return Correlation Matrix (Multi-collinearity Test)",
                 fontsize=11, fontweight="bold", color=GS_BLUE)
    fig.tight_layout()
    path = OUTPUT_DIR / "factor_correlation.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    log.info("Correlation heatmap saved → %s", path)
    return path


# =============================================================================
# SECTION 6 — PIPELINE
# =============================================================================

def run(etf_filter: Optional[List[str]] = None):
    etf_filter = etf_filter or list(ETF_CONFIGS.keys())

    log.info("=" * 65)
    log.info("GS QIS — Smart Beta Checks 1 & 2  (live data)")
    log.info("Coverage: %s", ", ".join(etf_filter))
    log.info("=" * 65)

    # Enrich configs with live name + expense ratio before anything else
    fetch_etf_metadata(ETF_CONFIGS)

    loader = DataLoader()
    factors, etf_data = loader.load()
    log.info("Data ready | %d months | %d ETFs", len(factors), len(etf_data))

    results: Dict[str, Tuple[RegressionResult, pd.DataFrame]] = {}

    for tkr in etf_filter:
        cfg = ETF_CONFIGS[tkr]
        ret = etf_data[tkr]

        print(f"\n{'═'*65}")
        print(f"  {tkr}  —  {cfg.full_name}")
        print(f"  Strategy    : {cfg.factor_strategy}")
        print(f"  Expense Ratio: {cfg.expense_ratio:.2%}  [{cfg.metadata_source}]")
        print(f"{'═'*65}")

        log.info("[%s] Check 1 — full-sample factor regression", tkr)
        reg = run_factor_regression(ret, factors, cfg)
        print_regression_table(reg)

        log.info("[%s] Check 2 — rolling %d-month regression", tkr, ROLLING_WINDOW)
        rolling = run_rolling_regression(ret, factors, cfg)
        print_stability_summary(tkr, cfg, rolling)

        results[tkr] = (reg, rolling)

    plot_dashboard(results, ETF_CONFIGS, etf_data, factors)
    plot_factor_correlation_heatmap(factors)

    # ── Executive summary ─────────────────────────────────────────────────
    print(f"\n{'═'*75}")
    print("  GS QIS — CHECKS 1 & 2 SUMMARY")
    print(f"  Run date : {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*75}")

    rows = []
    for tkr, (reg, rolling) in results.items():
        cfg = ETF_CONFIGS[tkr]
        tf  = cfg.target_factors[0]
        b   = reg.betas.get(tf, float("nan"))
        p   = reg.beta_pvals.get(tf, float("nan"))
        pvc = f"_pval_{tf}"
        stb = f"{(rolling[pvc] < SIGNIFICANCE).mean():.0%}" if pvc in rolling.columns else "N/A"

        exp_sign = cfg.expected_signs.get(tf)
        sign_ok  = (exp_sign is None) or (np.sign(b) == exp_sign)   # None = no directional requirement
        v1 = ("✓" if p < SIGNIFICANCE and sign_ok
              else "✗" if p < SIGNIFICANCE else "⚠")
        v2 = ("✓" if stb != "N/A" and float(stb.strip("%")) / 100 >= 0.80
              else "⚠" if stb != "N/A" and float(stb.strip("%")) / 100 >= 0.50
              else "✗")

        rows.append([tkr, cfg.factor_strategy, tf,
                     f"{b:.3f}" if not np.isnan(b) else "N/A",
                     f"{p:.3f}" if not np.isnan(p) else "N/A",
                     f"{reg.r_squared:.3f}", f"{reg.adj_r2:.3f}",
                     stb, f"{v1} Reg", f"{v2} Stab",
                     f"{cfg.expense_ratio:.2%} ({cfg.metadata_source})"])

    print(tabulate(rows,
                   headers=["Ticker", "Strategy", "Target", "β", "p-val",
                             "R²", "adj-R²", "% Stable", "Check 1", "Check 2",
                             "Exp. Ratio"],
                   tablefmt="rounded_outline"))
    print(f"\n  Output → {OUTPUT_DIR}/checks_comprehensive_dashboard.png")
    print(f"{'═'*75}\n")

    return results


# =============================================================================
# SECTION 7 — ENTRY POINT
# =============================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="GS QIS — Smart Beta Checks 1 & 2: Factor Regression + Rolling Stability"
    )
    parser.add_argument(
        "--etf",
        nargs="+",
        choices=list(ETF_CONFIGS.keys()),
        default=None,
        help="Restrict to specific ETF(s). Default: all.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress INFO logging.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.quiet:
        logging.getLogger("GS.QIS.Checks12").setLevel(logging.WARNING)
    run(etf_filter=args.etf)
    sys.exit(0)
