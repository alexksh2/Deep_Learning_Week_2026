"""
smart_beta_service.py
=====================
FastAPI service layer for smart_beta_checks_comprehensive.py.

Imports the analysis script directly (both files live in ml-development/etf-analysis/).
Adds parquet caching and JSON serialisation on top.

Parquet cache (ml-development/etf-analysis/cache/)
------------------------------------
  factors.parquet      — monthly factor returns (Ken French + FRED)
  etf_returns.parquet  — monthly ETF excess returns
  etf_prices.parquet   — monthly ETF adjusted-close prices
  factor_corr.parquet  — 9×9 factor correlation matrix
  meta.json            — cache timestamp

Cache TTL: 24 h (override with SMART_BETA_CACHE_TTL env var, in seconds).
"""

import contextlib
import json
import logging
import math
import os
import sys
import time
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

# ── import the analysis script (same directory) ───────────────────────────────
from smart_beta_checks_comprehensive import (
    ETFConfig,
    ETF_CONFIGS,
    FACTOR_LIST,
    DataLoader,
    run_factor_regression,
    run_rolling_regression,
)

log = logging.getLogger(__name__)

CACHE_DIR    = Path(__file__).parent / "cache"
CACHE_TTL    = int(os.environ.get("SMART_BETA_CACHE_TTL", 86400))
FACTORS_FILE = CACHE_DIR / "factors.parquet"
ETF_RET_FILE = CACHE_DIR / "etf_returns.parquet"
ETF_PX_FILE  = CACHE_DIR / "etf_prices.parquet"
CORR_FILE    = CACHE_DIR / "factor_corr.parquet"
META_FILE    = CACHE_DIR / "meta.json"


# ── helpers ───────────────────────────────────────────────────────────────────

@contextlib.contextmanager
def _suppress_output():
    devnull = open(os.devnull, "w")
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = devnull
    try:
        yield
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        devnull.close()


def _safe(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


# ── parquet cache ─────────────────────────────────────────────────────────────

def _cache_fresh() -> bool:
    if not META_FILE.exists():
        return False
    meta = json.loads(META_FILE.read_text())
    age  = time.time() - meta.get("cached_at", 0)
    log.info("Cache age: %.0f s (TTL %d s)", age, CACHE_TTL)
    return age < CACHE_TTL


def _fetch_etf_prices(tickers: list) -> pd.DataFrame:
    if not tickers:
        return pd.DataFrame()
    import yfinance as yf
    with _suppress_output():
        raw = yf.download(
            tickers=tickers, period="15y", interval="1mo",
            auto_adjust=True, progress=False,
        )
    if raw.empty:
        return pd.DataFrame()
    close = raw["Close"] if "Close" in raw else raw
    if isinstance(close, pd.Series):
        close = close.to_frame(name=tickers[0])
    close.index = close.index.to_period("M").to_timestamp("M")
    return close


def _fetch_dynamic_etf_series(
    tickers: list,
    factors_df: pd.DataFrame,
) -> tuple[Dict[str, pd.Series], pd.DataFrame]:
    """
    Fetch monthly excess returns for user-requested tickers not present
    in the hardcoded ETF universe.
    """
    requested = [t.strip().upper() for t in tickers if t and t.strip()]
    if not requested:
        return {}, pd.DataFrame()

    prices = _fetch_etf_prices(requested)
    if prices.empty:
        return {}, pd.DataFrame()

    prices = prices.sort_index()
    returns = prices.pct_change()
    common = returns.index.intersection(factors_df.index)
    if common.empty:
        return {}, prices

    rf = factors_df.loc[common, "RF"]
    etf_data: Dict[str, pd.Series] = {}
    for ticker in requested:
        if ticker not in returns.columns:
            log.warning("Ticker %s not returned by yfinance", ticker)
            continue
        ret = returns[ticker].loc[common]
        n_obs = int(ret.notna().sum())
        if n_obs < 24:
            log.warning("Ticker %s has insufficient history (%d months)", ticker, n_obs)
            continue
        etf_data[ticker] = (ret - rf).rename(ticker)

    return etf_data, prices


def _merge_prices(base: pd.DataFrame, extra: pd.DataFrame) -> pd.DataFrame:
    if extra is None or extra.empty:
        return base
    if base is None or base.empty:
        return extra.sort_index()

    merged = base.copy()
    for col in extra.columns:
        merged[col] = extra[col]
    return merged.sort_index()


def _build_dynamic_config(ticker: str) -> ETFConfig:
    """
    Build a generic config for ETFs not defined in ETF_CONFIGS so analysis can run.
    """
    full_name = f"{ticker} (Custom ETF)"
    expense_ratio = 0.0
    metadata_source = "inferred"

    try:
        import yfinance as yf

        info = yf.Ticker(ticker).info or {}
        name = info.get("longName") or info.get("shortName")
        if isinstance(name, str) and name.strip():
            full_name = name.strip()

        er = (
            info.get("annualReportExpenseRatio")
            or info.get("totalExpenseRatio")
            or info.get("expenseRatio")
        )
        if er is not None:
            try:
                erf = float(er)
                if 0 < erf < 1:
                    expense_ratio = erf
            except (TypeError, ValueError):
                pass

        metadata_source = "live"
    except Exception as exc:
        log.warning("Metadata lookup failed for %s (%s) — using defaults", ticker, exc)

    return ETFConfig(
        ticker=ticker,
        full_name=full_name,
        factor_strategy="Unclassified",
        target_factors=[],
        expected_signs={factor: None for factor in FACTOR_LIST},
        expense_ratio=expense_ratio,
        metadata_source=metadata_source,
    )


def _save_cache(factors_df: pd.DataFrame, etf_data: dict, etf_prices: pd.DataFrame) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    factors_df.to_parquet(FACTORS_FILE)
    pd.DataFrame(etf_data).to_parquet(ETF_RET_FILE)
    etf_prices.to_parquet(ETF_PX_FILE)
    fac_cols = [c for c in factors_df.columns if c != "RF"]
    factors_df[fac_cols].corr().to_parquet(CORR_FILE)
    META_FILE.write_text(json.dumps({"cached_at": time.time()}))
    log.info("Cache saved → %s", CACHE_DIR)


def _load_cache() -> tuple:
    factors_df = pd.read_parquet(FACTORS_FILE)
    etf_ret_df = pd.read_parquet(ETF_RET_FILE)
    etf_data   = {col: etf_ret_df[col].dropna() for col in etf_ret_df.columns}
    etf_prices = pd.read_parquet(ETF_PX_FILE)
    corr_df    = pd.read_parquet(CORR_FILE)
    log.info("Cache loaded: %d months, %d ETFs", len(factors_df), len(etf_data))
    return factors_df, etf_data, etf_prices, corr_df


def _load_data() -> tuple:
    if _cache_fresh():
        try:
            return _load_cache()
        except Exception as e:
            log.warning("Cache load failed (%s), re-downloading…", e)

    log.info("Downloading factor data and ETF prices…")
    with _suppress_output():
        loader = DataLoader()
        factors_df, etf_data = loader.load()

    tickers    = list(etf_data.keys())
    etf_prices = _fetch_etf_prices(tickers)
    log.info("ETF prices fetched: %d rows × %d tickers", len(etf_prices), len(tickers))

    try:
        _save_cache(factors_df, etf_data, etf_prices)
    except Exception as e:
        log.warning("Cache save failed: %s", e)

    fac_cols = [c for c in factors_df.columns if c != "RF"]
    corr_df  = factors_df[fac_cols].corr()
    return factors_df, etf_data, etf_prices, corr_df


# ── serialisation ─────────────────────────────────────────────────────────────

def _serialise_factor_corr(corr_df: pd.DataFrame) -> dict:
    factors = list(corr_df.columns)
    matrix  = [[_safe(v) for v in row] for row in corr_df.values.tolist()]
    return {"factors": factors, "matrix": matrix}


def _serialise_cumulative_return(etf_excess: pd.Series) -> list:
    cum = (1 + etf_excess.dropna()).cumprod()
    return [{"date": d.strftime("%Y-%m-%d"), "value": _safe(v)} for d, v in cum.items()]


def _serialise_price_history(etf_prices: pd.DataFrame, ticker: str) -> list:
    if ticker not in etf_prices.columns:
        return []
    px = etf_prices[ticker].dropna()
    if px.empty:
        return []
    px_norm = px / px.iloc[0] * 100
    return [{"date": d.strftime("%Y-%m-%d"), "price": _safe(v)} for d, v in px_norm.items()]


# ── public API ────────────────────────────────────────────────────────────────

def get_available_etfs() -> list:
    return [
        {
            "ticker":         ticker,
            "name":           cfg.full_name,
            "strategy":       cfg.factor_strategy,
            "target_factors": cfg.target_factors,
            "expense_ratio":  cfg.expense_ratio,
        }
        for ticker, cfg in ETF_CONFIGS.items()
    ]


def analyze(tickers: list) -> dict:
    """
    Run Check 1 + Check 2 for the given tickers.

    Returns a JSON-serializable dict:
      {
        "USMV": {
          name, strategy, target_factors, expense_ratio, n_obs,
          check1:  { alpha, alpha_pval, alpha_tstat, r_squared, adj_r2,
                     factors: {f: {beta, se, tstat, pval}} },
          check2:  [ {date, MKT, _pval_MKT, ...} ],
          cumulative_return: [ {date, value} ],
          price_history:     [ {date, price} ],
        },
        "_factor_correlation": { factors: [...], matrix: [[...]] }
      }
    """
    factors_df, etf_data, etf_prices, corr_df = _load_data()
    output: dict = {}
    requested_tickers: list[str] = []
    for ticker in tickers:
        t = ticker.strip().upper()
        if t and t not in requested_tickers:
            requested_tickers.append(t)

    missing_from_cache = [t for t in requested_tickers if t not in etf_data]
    if missing_from_cache:
        extra_data, extra_prices = _fetch_dynamic_etf_series(missing_from_cache, factors_df)
        etf_data.update(extra_data)
        etf_prices = _merge_prices(etf_prices, extra_prices)

    dynamic_configs: Dict[str, ETFConfig] = {}

    for ticker in requested_tickers:
        if ticker not in etf_data:
            log.warning("Ticker %s not in ETF data", ticker)
            continue

        config = ETF_CONFIGS.get(ticker)
        if config is None:
            config = dynamic_configs.get(ticker)
            if config is None:
                config = _build_dynamic_config(ticker)
                dynamic_configs[ticker] = config
        etf_excess = etf_data[ticker]

        log.info("Running analysis for %s…", ticker)
        try:
            with _suppress_output():
                reg        = run_factor_regression(etf_excess, factors_df, config)
                rolling_df = run_rolling_regression(etf_excess, factors_df, config)
        except Exception as exc:
            log.warning("Analysis failed for %s (%s)", ticker, exc)
            continue

        check1_factors: dict = {}
        for f in FACTOR_LIST:
            beta = _safe(reg.betas.get(f))
            if beta is None:
                continue
            check1_factors[f] = {
                "beta":  beta,
                "se":    _safe(reg.beta_se.get(f)),
                "tstat": _safe(reg.beta_tstats.get(f)),
                "pval":  _safe(reg.beta_pvals.get(f)),
            }

        check2: list = []
        if rolling_df is not None and len(rolling_df) > 0:
            for date, row in rolling_df.iterrows():
                record: dict = {"date": date.strftime("%Y-%m-%d")}
                for col in rolling_df.columns:
                    record[col] = _safe(row[col])
                check2.append(record)

        output[ticker] = {
            "name":             config.full_name,
            "strategy":         config.factor_strategy,
            "target_factors":   config.target_factors,
            "expense_ratio":    config.expense_ratio,
            "n_obs":            reg.n_obs,
            "check1": {
                "alpha":       _safe(reg.alpha),
                "alpha_pval":  _safe(reg.alpha_pval),
                "alpha_tstat": _safe(reg.alpha_tstat),
                "r_squared":   _safe(reg.r_squared),
                "adj_r2":      _safe(reg.adj_r2),
                "factors":     check1_factors,
            },
            "check2":            check2,
            "cumulative_return": _serialise_cumulative_return(etf_excess),
            "price_history":     _serialise_price_history(etf_prices, ticker),
        }

    output["_factor_correlation"] = _serialise_factor_corr(corr_df)
    return output
