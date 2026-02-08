// Event system for wallet transactions
// Emits events that can be consumed by webhooks or internal listeners

export type WalletEventType =
  | "WALLET_TOPUP"
  | "WALLET_BONUS"
  | "WALLET_SPEND"
  | "BALANCE_LOW"
  | "TRANSACTION_FAILED";

export interface WalletEvent {
  eventId: string;
  eventType: WalletEventType;
  timestamp: Date;
  userId: string;
  assetCode: string;
  amount: string;
  transactionId?: string;
  metadata?: Record<string, any>;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  eventTypes: WalletEventType[];
  secret?: string;
  active: boolean;
  retryCount: number;
  createdAt: Date;
}

class EventEmitter {
  private subscribers: Map<string, WebhookSubscription[]> = new Map();
  private eventHistory: WalletEvent[] = [];
  private maxHistorySize = 1000;

  // Subscribe to specific event types
  subscribe(subscription: WebhookSubscription): void {
    for (const eventType of subscription.eventTypes) {
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, []);
      }
      this.subscribers.get(eventType)!.push(subscription);
    }
    console.log(
      `📡 Webhook subscribed: ${subscription.url} for ${subscription.eventTypes.join(", ")}`,
    );
  }

  // Unsubscribe a webhook
  unsubscribe(subscriptionId: string): void {
    for (const [eventType, subs] of this.subscribers.entries()) {
      const filtered = subs.filter((sub) => sub.id !== subscriptionId);
      this.subscribers.set(eventType, filtered);
    }
    console.log(`🔕 Webhook unsubscribed: ${subscriptionId}`);
  }

  // Emit an event
  async emit(event: WalletEvent): Promise<void> {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    console.log(
      `📢 Event emitted: ${event.eventType} for user ${event.userId}`,
    );

    // Get subscribers for this event type
    const subscribers = this.subscribers.get(event.eventType) || [];

    // Send to all active subscribers
    const webhookPromises = subscribers
      .filter((sub) => sub.active)
      .map((sub) => this.sendWebhook(sub, event));

    await Promise.allSettled(webhookPromises);
  }

  // Send webhook to a subscriber
  private async sendWebhook(
    subscription: WebhookSubscription,
    event: WalletEvent,
  ): Promise<void> {
    try {
      const payload = {
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.timestamp.toISOString(),
        data: {
          userId: event.userId,
          assetCode: event.assetCode,
          amount: event.amount,
          transactionId: event.transactionId,
          metadata: event.metadata,
        },
      };

      // Add signature if secret is present
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Event-Type": event.eventType,
        "X-Event-ID": event.eventId,
      };

      if (subscription.secret) {
        const signature = await this.generateSignature(
          JSON.stringify(payload),
          subscription.secret,
        );
        headers["X-Webhook-Signature"] = signature;
      }

      const response = await fetch(subscription.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }

      console.log(
        `✅ Webhook delivered: ${subscription.url} (${event.eventType})`,
      );
    } catch (error) {
      console.error(
        `❌ Webhook failed: ${subscription.url} - ${error.message}`,
      );
      // Could implement retry logic here
    }
  }

  // Generate HMAC signature for webhook verification
  private async generateSignature(
    payload: string,
    secret: string,
  ): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload),
    );

    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Get event history
  getHistory(limit: number = 100): WalletEvent[] {
    return this.eventHistory.slice(-limit);
  }

  // Get subscribers
  getSubscribers(): Map<string, WebhookSubscription[]> {
    return this.subscribers;
  }
}

// Singleton instance
export const eventEmitter = new EventEmitter();

// Helper functions to emit specific events
export async function emitTopUpEvent(
  userId: string,
  assetCode: string,
  amount: string,
  transactionId: string,
): Promise<void> {
  await eventEmitter.emit({
    eventId: crypto.randomUUID(),
    eventType: "WALLET_TOPUP",
    timestamp: new Date(),
    userId,
    assetCode,
    amount,
    transactionId,
  });
}

export async function emitBonusEvent(
  userId: string,
  assetCode: string,
  amount: string,
  transactionId: string,
): Promise<void> {
  await eventEmitter.emit({
    eventId: crypto.randomUUID(),
    eventType: "WALLET_BONUS",
    timestamp: new Date(),
    userId,
    assetCode,
    amount,
    transactionId,
  });
}

export async function emitSpendEvent(
  userId: string,
  assetCode: string,
  amount: string,
  transactionId: string,
): Promise<void> {
  await eventEmitter.emit({
    eventId: crypto.randomUUID(),
    eventType: "WALLET_SPEND",
    timestamp: new Date(),
    userId,
    assetCode,
    amount,
    transactionId,
  });
}

export async function emitBalanceLowEvent(
  userId: string,
  assetCode: string,
  currentBalance: string,
): Promise<void> {
  await eventEmitter.emit({
    eventId: crypto.randomUUID(),
    eventType: "BALANCE_LOW",
    timestamp: new Date(),
    userId,
    assetCode,
    amount: currentBalance,
    metadata: { threshold: "100.00" },
  });
}

export async function emitTransactionFailedEvent(
  userId: string,
  assetCode: string,
  amount: string,
  error: string,
): Promise<void> {
  await eventEmitter.emit({
    eventId: crypto.randomUUID(),
    eventType: "TRANSACTION_FAILED",
    timestamp: new Date(),
    userId,
    assetCode,
    amount,
    metadata: { error },
  });
}
