/**
 * PATCH 7.2 — Error Analytics reason code catalog
 *
 * Maps runtime reasonCode values to analytical error_type, error_layer, severity.
 * New codes may be added; existing entries must not be renamed without version bump.
 */

export const MIA_ERROR_TYPES = Object.freeze({
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  RATE_LIMIT_ERROR: "RATE_LIMIT_ERROR",
  DATA_LAYER_ERROR: "DATA_LAYER_ERROR",
  DECISION_ENGINE_ERROR: "DECISION_ENGINE_ERROR",
  ROUTER_ERROR: "ROUTER_ERROR",
  CONTRACT_ERROR: "CONTRACT_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  PERSISTENCE_ERROR: "PERSISTENCE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
});

export const MIA_ERROR_LAYERS = Object.freeze({
  HTTP: "HTTP",
  AUTH: "AUTH",
  ROUTER: "ROUTER",
  DATA_LAYER: "DATA_LAYER",
  DECISION_ENGINE: "DECISION_ENGINE",
  CONTRACTS: "CONTRACTS",
  RESPONSE_BUILDER: "RESPONSE_BUILDER",
  PROVIDER: "PROVIDER",
  DATABASE: "DATABASE",
  ANALYTICS: "ANALYTICS",
  UNKNOWN: "UNKNOWN",
});

export const MIA_ERROR_SEVERITIES = Object.freeze({
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
});

export const MIA_RECOVERY_METHODS = Object.freeze({
  FALLBACK: "fallback",
  RETRY: "retry",
  GRACEFUL_DEGRADATION: "graceful_degradation",
  CACHED_RESULT: "cached_result",
  ALTERNATE_PROVIDER: "alternate_provider",
  NONE: "none",
});

/** @type {Record<string, { error_type: string, error_layer: string, severity: string, user_facing?: boolean, default_recoverable?: boolean }>} */
export const MIA_ERROR_REASON_CODE_CATALOG = Object.freeze({
  // HTTP / validation (user-facing, expected)
  chat_empty_query: {
    error_type: MIA_ERROR_TYPES.VALIDATION_ERROR,
    error_layer: MIA_ERROR_LAYERS.HTTP,
    severity: MIA_ERROR_SEVERITIES.INFO,
    user_facing: true,
    default_recoverable: true,
  },
  internal_api_method_not_allowed: {
    error_type: MIA_ERROR_TYPES.VALIDATION_ERROR,
    error_layer: MIA_ERROR_LAYERS.HTTP,
    severity: MIA_ERROR_SEVERITIES.INFO,
    user_facing: true,
    default_recoverable: false,
  },
  public_api_origin_not_allowed: {
    error_type: MIA_ERROR_TYPES.AUTHORIZATION_ERROR,
    error_layer: MIA_ERROR_LAYERS.AUTH,
    severity: MIA_ERROR_SEVERITIES.INFO,
    user_facing: true,
    default_recoverable: false,
  },
  perimeter_rate_limited: {
    error_type: MIA_ERROR_TYPES.RATE_LIMIT_ERROR,
    error_layer: MIA_ERROR_LAYERS.HTTP,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    user_facing: true,
    default_recoverable: false,
  },
  perimeter_upstream_error: {
    error_type: MIA_ERROR_TYPES.INTERNAL_ERROR,
    error_layer: MIA_ERROR_LAYERS.RESPONSE_BUILDER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },

  // Auth
  internal_api_auth_invalid: {
    error_type: MIA_ERROR_TYPES.AUTHENTICATION_ERROR,
    error_layer: MIA_ERROR_LAYERS.AUTH,
    severity: MIA_ERROR_SEVERITIES.INFO,
    user_facing: true,
    default_recoverable: false,
  },

  // Internal / platform
  chat_internal_error: {
    error_type: MIA_ERROR_TYPES.INTERNAL_ERROR,
    error_layer: MIA_ERROR_LAYERS.RESPONSE_BUILDER,
    severity: MIA_ERROR_SEVERITIES.CRITICAL,
    default_recoverable: false,
  },
  internal_error: {
    error_type: MIA_ERROR_TYPES.INTERNAL_ERROR,
    error_layer: MIA_ERROR_LAYERS.UNKNOWN,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },

  // Contracts / runtime precedence
  unknown_response_path: {
    error_type: MIA_ERROR_TYPES.CONTRACT_ERROR,
    error_layer: MIA_ERROR_LAYERS.CONTRACTS,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },

  // Provider / external
  provider_error: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },
  provider_unavailable: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },
  provider_disabled: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },
  timeout: {
    error_type: MIA_ERROR_TYPES.TIMEOUT_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },
  empty_response: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },
  provider_normalization_empty: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },
  missing_public_config: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },
  budget_exhausted: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },
  circuit_open: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },
  circuit_breaker_open: {
    error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
    error_layer: MIA_ERROR_LAYERS.PROVIDER,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },

  // Database / persistence
  supabase_service_role_missing: {
    error_type: MIA_ERROR_TYPES.DATABASE_ERROR,
    error_layer: MIA_ERROR_LAYERS.DATABASE,
    severity: MIA_ERROR_SEVERITIES.CRITICAL,
    default_recoverable: false,
  },
  credential_store_read_failed: {
    error_type: MIA_ERROR_TYPES.PERSISTENCE_ERROR,
    error_layer: MIA_ERROR_LAYERS.DATABASE,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },

  // Analytics (self)
  analytics_insert_failed: {
    error_type: MIA_ERROR_TYPES.INTERNAL_ERROR,
    error_layer: MIA_ERROR_LAYERS.ANALYTICS,
    severity: MIA_ERROR_SEVERITIES.WARNING,
    default_recoverable: true,
  },

  // Router / cognitive (transport failures — technical, not NO_RESULT)
  image_identification_failed: {
    error_type: MIA_ERROR_TYPES.ROUTER_ERROR,
    error_layer: MIA_ERROR_LAYERS.ROUTER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },
  image_search_error: {
    error_type: MIA_ERROR_TYPES.ROUTER_ERROR,
    error_layer: MIA_ERROR_LAYERS.ROUTER,
    severity: MIA_ERROR_SEVERITIES.ERROR,
    default_recoverable: false,
  },

  // Decision / gate (observational — often recovered via fallback)
  commercial_entry_denied: {
    error_type: MIA_ERROR_TYPES.DECISION_ENGINE_ERROR,
    error_layer: MIA_ERROR_LAYERS.DECISION_ENGINE,
    severity: MIA_ERROR_SEVERITIES.INFO,
    default_recoverable: true,
  },
  intent_authority_deny: {
    error_type: MIA_ERROR_TYPES.DECISION_ENGINE_ERROR,
    error_layer: MIA_ERROR_LAYERS.DECISION_ENGINE,
    severity: MIA_ERROR_SEVERITIES.INFO,
    default_recoverable: true,
  },
});

/**
 * @param {string|null|undefined} reasonCode
 * @param {{ error_type?: string, error_layer?: string, severity?: string }=} overrides
 */
export function resolveReasonCodeMapping(reasonCode = "", overrides = {}) {
  const code = String(reasonCode || "").trim().toLowerCase();
  const catalog = MIA_ERROR_REASON_CODE_CATALOG[code] || null;

  if (catalog) {
    return {
      reason_code: code || null,
      error_type: overrides.error_type || catalog.error_type,
      error_layer: overrides.error_layer || catalog.error_layer,
      severity: overrides.severity || catalog.severity,
      user_facing: catalog.user_facing === true,
      default_recoverable: catalog.default_recoverable === true,
    };
  }

  // Heuristic fallbacks for undocumented codes (avoid UNKNOWN dominance)
  if (code.includes("auth")) {
    return {
      reason_code: code,
      error_type: MIA_ERROR_TYPES.AUTHENTICATION_ERROR,
      error_layer: MIA_ERROR_LAYERS.AUTH,
      severity: MIA_ERROR_SEVERITIES.INFO,
      user_facing: true,
      default_recoverable: false,
    };
  }
  if (code.includes("timeout")) {
    return {
      reason_code: code,
      error_type: MIA_ERROR_TYPES.TIMEOUT_ERROR,
      error_layer: MIA_ERROR_LAYERS.PROVIDER,
      severity: MIA_ERROR_SEVERITIES.ERROR,
      default_recoverable: false,
    };
  }
  if (code.includes("provider") || code.includes("fetch")) {
    return {
      reason_code: code,
      error_type: MIA_ERROR_TYPES.PROVIDER_ERROR,
      error_layer: MIA_ERROR_LAYERS.PROVIDER,
      severity: MIA_ERROR_SEVERITIES.WARNING,
      default_recoverable: true,
    };
  }
  if (code.includes("contract") || code.includes("violation")) {
    return {
      reason_code: code,
      error_type: MIA_ERROR_TYPES.CONTRACT_ERROR,
      error_layer: MIA_ERROR_LAYERS.CONTRACTS,
      severity: MIA_ERROR_SEVERITIES.WARNING,
      default_recoverable: true,
    };
  }

  return {
    reason_code: code || null,
    error_type: overrides.error_type || MIA_ERROR_TYPES.UNKNOWN_ERROR,
    error_layer: overrides.error_layer || MIA_ERROR_LAYERS.UNKNOWN,
    severity: overrides.severity || MIA_ERROR_SEVERITIES.ERROR,
    user_facing: false,
    default_recoverable: false,
  };
}
