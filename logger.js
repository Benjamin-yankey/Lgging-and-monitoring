const winston = require("winston");
const { trace, context } = require("@opentelemetry/api");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Helper to wrap logs with trace context
const logInfo = (message, meta = {}) => {
  const span = trace.getSpan(context.active());
  if (span) {
    const { traceId, spanId } = span.spanContext();
    meta.trace_id = traceId;
    meta.span_id = spanId;
  }
  logger.info(message, meta);
};

const logError = (message, meta = {}) => {
  const span = trace.getSpan(context.active());
  if (span) {
    const { traceId, spanId } = span.spanContext();
    meta.trace_id = traceId;
    meta.span_id = spanId;
  }
  logger.error(message, meta);
};

module.exports = {
  logger,
  logInfo,
  logError,
};
