import { Hono } from "hono";
import { metrics } from "../monitoring/metrics";

const metricsRoutes = new Hono();

// Prometheus-compatible metrics endpoint
metricsRoutes.get("/", (c) => {
  const prometheusMetrics = metrics.exportPrometheus();
  return c.text(prometheusMetrics, 200, {
    "Content-Type": "text/plain; version=0.0.4",
  });
});

// JSON metrics endpoint
metricsRoutes.get("/json", (c) => {
  const jsonMetrics = metrics.exportJSON();
  return c.json(jsonMetrics);
});

// Summary dashboard endpoint
metricsRoutes.get("/summary", (c) => {
  const summary = metrics.getSummary();
  return c.json(summary);
});

// Health check endpoint
metricsRoutes.get("/health", (c) => {
  const summary = metrics.getSummary();

  const isHealthy =
    summary.errorRate < 10 && // Less than 10% errors
    summary.avgRequestDuration < 1000; // Avg response < 1s

  return c.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      metrics: summary,
    },
    isHealthy ? 200 : 503,
  );
});

// Readiness check (for Kubernetes)
metricsRoutes.get("/ready", (c) => {
  // Could check database connectivity here
  return c.json({
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

// Liveness check (for Kubernetes)
metricsRoutes.get("/live", (c) => {
  return c.json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

export default metricsRoutes;
