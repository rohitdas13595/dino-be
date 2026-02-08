// Prometheus-compatible metrics collection
// Tracks API requests, transaction counts, errors, and performance

interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private labels: Map<string, Record<string, string>> = new Map();

  // Counter: monotonically increasing value
  incrementCounter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    if (labels) this.labels.set(key, labels);
  }

  // Gauge: value that can go up or down
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    if (labels) this.labels.set(key, labels);
  }

  // Histogram: track distribution of values
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    if (labels) this.labels.set(key, labels);

    // Keep only last 1000 values
    const values = this.histograms.get(key)!;
    if (values.length > 1000) {
      values.shift();
    }
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  // Calculate percentile from histogram
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // Export metrics in Prometheus format
  exportPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [key, value] of this.counters.entries()) {
      lines.push(`# TYPE ${key.split("{")[0]} counter`);
      lines.push(`${key} ${value}`);
    }

    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      lines.push(`# TYPE ${key.split("{")[0]} gauge`);
      lines.push(`${key} ${value}`);
    }

    // Histograms
    for (const [key, values] of this.histograms.entries()) {
      const baseName = key.split("{")[0];
      const labels = this.labels.get(key);
      const labelStr = labels
        ? "{" +
          Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(",") +
          "}"
        : "";

      lines.push(`# TYPE ${baseName} histogram`);
      lines.push(
        `${baseName}_sum${labelStr} ${values.reduce((a, b) => a + b, 0)}`,
      );
      lines.push(`${baseName}_count${labelStr} ${values.length}`);
      lines.push(`${baseName}_p50${labelStr} ${this.percentile(values, 50)}`);
      lines.push(`${baseName}_p95${labelStr} ${this.percentile(values, 95)}`);
      lines.push(`${baseName}_p99${labelStr} ${this.percentile(values, 99)}`);
    }

    return lines.join("\n") + "\n";
  }

  // Export metrics as JSON
  exportJSON() {
    const metricsObj: any = {
      timestamp: new Date().toISOString(),
      counters: {},
      gauges: {},
      histograms: {},
    };

    for (const [key, value] of this.counters.entries()) {
      metricsObj.counters[key] = value;
    }

    for (const [key, value] of this.gauges.entries()) {
      metricsObj.gauges[key] = value;
    }

    for (const [key, values] of this.histograms.entries()) {
      metricsObj.histograms[key] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: this.percentile(values, 50),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }

    return metricsObj;
  }

  // Get summary statistics
  getSummary() {
    let totalRequests = 0;
    let totalErrors = 0;
    let totalTransactions = 0;

    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith("http_requests_total")) totalRequests += value;
      if (key.startsWith("http_errors_total")) totalErrors += value;
      if (key.startsWith("transactions_total")) totalTransactions += value;
    }

    const requestDurations: number[] = [];
    for (const [key, values] of this.histograms.entries()) {
      if (key.startsWith("http_request_duration_ms")) {
        requestDurations.push(...values);
      }
    }

    const avgRequestDuration =
      requestDurations.length > 0
        ? requestDurations.reduce((a, b) => a + b, 0) / requestDurations.length
        : 0;

    return {
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      totalTransactions,
      avgRequestDuration: Math.round(avgRequestDuration * 100) / 100,
      p95RequestDuration: this.percentile(requestDurations, 95),
      p99RequestDuration: this.percentile(requestDurations, 99),
    };
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.labels.clear();
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Helper functions for common metrics
export function trackRequest(
  method: string,
  path: string,
  status: number,
  duration: number,
): void {
  metrics.incrementCounter("http_requests_total", 1, {
    method,
    path,
    status: status.toString(),
  });
  metrics.observe("http_request_duration_ms", duration, { method, path });

  if (status >= 400) {
    metrics.incrementCounter("http_errors_total", 1, {
      method,
      path,
      status: status.toString(),
    });
  }
}

export function trackTransaction(
  type: "TOPUP" | "BONUS" | "SPEND",
  success: boolean,
): void {
  metrics.incrementCounter("transactions_total", 1, {
    type,
    status: success ? "success" : "failed",
  });
}

export function trackBalance(
  userId: string,
  assetCode: string,
  balance: number,
): void {
  metrics.setGauge("wallet_balance", balance, { userId, assetCode });
}

export function trackDatabaseQuery(duration: number): void {
  metrics.observe("db_query_duration_ms", duration);
}

// Middleware to track HTTP requests
export function metricsMiddleware() {
  return async (c: any, next: any) => {
    const start = performance.now();

    await next();

    const duration = performance.now() - start;
    const method = c.req.method;
    const path = c.req.path;
    const status = c.res.status;

    trackRequest(method, path, status, duration);
  };
}
