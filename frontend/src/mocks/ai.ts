// Stand-in for the AI service (Gemini + tool calling) until Member 3's endpoint is ready.
// It matches keywords to the same tools the real model will call, and returns real numbers
// from the billing mock. Actions (reminders, invoices) only run after approval.
import { ApiError } from "@/services/api";
import { billingInsights, mockInvoices } from "@/mocks/billing";
import { mockDelay } from "@/mocks/utils";
import type { AiActionResult, AiAssistantReply, AiChatRequest, AiChatResponse, AiToolCall } from "@/types/ai";

let counter = 1;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`;
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function tool(name: string, args: AiToolCall["args"], summary: string): AiToolCall {
  return { id: uid("tool"), name, args, status: "success", summary };
}

/** Actions waiting for approval: id → what to run when approved. */
const pendingActions = new Map<string, () => Promise<string>>();

/** "next 30 days" / "in 2 weeks" → days; defaults to `fallback`. */
function parseDays(text: string, fallback: number): number {
  const days = text.match(/(\d+)\s*day/);
  if (days) return Math.min(365, Number(days[1]));
  const weeks = text.match(/(\d+)\s*week/);
  if (weeks) return Math.min(52, Number(weeks[1])) * 7;
  if (/\bmonth\b/.test(text)) return 30;
  if (/\btoday\b/.test(text)) return 1;
  return fallback;
}

// --- Intents -----------------------------------------------------------------------

function expiring(text: string): AiAssistantReply {
  const days = parseDays(text, 7);
  const rows = billingInsights.expiringSubscriptions(days);
  const value = rows.reduce((s, r) => s + r.monthly_value, 0);
  return {
    id: uid("msg"),
    content: rows.length
      ? `**${rows.length} subscription${rows.length > 1 ? "s" : ""}** expire in the next ${days} days, worth **${inr(value)}/month** in recurring revenue.\n\nThe most urgent is **${rows[0].customer_name}** (${rows[0].subscription_number}), ending in ${rows[0].days_left} day${rows[0].days_left === 1 ? "" : "s"}.`
      : `No subscriptions expire in the next ${days} days.`,
    tool_calls: [tool("get_expiring_subscriptions", { days }, `${rows.length} found`)],
    data: rows.length
      ? {
          kind: "table",
          title: `Expiring in the next ${days} days`,
          columns: [
            { key: "subscription_number", label: "Subscription" },
            { key: "customer_name", label: "Customer" },
            { key: "plan_name", label: "Plan" },
            { key: "end_date", label: "Ends", format: "date" },
            { key: "monthly_value", label: "Monthly value", format: "currency", align: "right" },
          ],
          rows,
          link: { base: "/subscriptions/", key: "subscription_id" },
        }
      : undefined,
    suggestions: rows.length ? ["Prepare renewal reminders for them", "Show expiring in the next 30 days"] : ["Show expiring in the next 30 days"],
  };
}

function reminders(text: string): AiAssistantReply {
  const days = parseDays(text, 14);
  const rows = billingInsights.expiringSubscriptions(days);
  if (rows.length === 0) {
    return {
      id: uid("msg"),
      content: `No subscriptions expire in the next ${days} days, so there's nobody to remind.`,
      tool_calls: [tool("get_expiring_subscriptions", { days }, "0 found")],
    };
  }
  const actionId = uid("act");
  pendingActions.set(actionId, async () => {
    await mockDelay(900);
    return `${rows.length} renewal reminder${rows.length > 1 ? "s" : ""} sent`;
  });
  return {
    id: uid("msg"),
    content: `I've drafted **${rows.length} renewal reminder${rows.length > 1 ? "s" : ""}** for subscriptions ending in the next ${days} days. Each email includes the plan, end date and a renewal link.\n\nNothing has been sent yet — review the list and approve to send.`,
    tool_calls: [
      tool("get_expiring_subscriptions", { days }, `${rows.length} found`),
      tool("prepare_renewal_reminders", { count: rows.length }, `${rows.length} drafts ready`),
    ],
    pending_action: {
      id: actionId,
      type: "send_renewal_reminders",
      title: `Send ${rows.length} renewal reminder${rows.length > 1 ? "s" : ""}`,
      description: "Emails go to each customer's billing address.",
      preview: rows.map((r) => ({
        label: `${r.customer_name} · ${r.customer_email}`,
        detail: `${r.plan_name} (${r.subscription_number}) ends in ${r.days_left} day${r.days_left === 1 ? "" : "s"}`,
      })),
      confirm_label: "Approve & send",
    },
  };
}

async function generateInvoices(): Promise<AiAssistantReply> {
  const preview = await mockInvoices.duePreview();
  const ready = preview.filter((p) => p.status === "ready");
  const skipped = preview.length - ready.length;
  const calls = [tool("get_subscriptions_due_for_billing", {}, `${preview.length} due · ${skipped} already billed`)];

  if (ready.length === 0) {
    return {
      id: uid("msg"),
      content: `Every subscription due today is **already invoiced** (${skipped} checked), so there's nothing to generate. I never bill the same period twice.`,
      tool_calls: calls,
      suggestions: ["Show overdue invoices"],
    };
  }

  const total = ready.reduce((s, r) => s + r.estimated_total, 0);
  const actionId = uid("act");
  pendingActions.set(actionId, async () => {
    const result = await mockInvoices.generateDue();
    return `${result.created} draft invoice${result.created === 1 ? "" : "s"} created${result.skipped ? ` · ${result.skipped} skipped (already billed)` : ""}`;
  });

  return {
    id: uid("msg"),
    content: `**${ready.length} subscription${ready.length > 1 ? "s are" : " is"} due for billing**, totalling about **${inr(total)}** including taxes and discounts. ${skipped ? `${skipped} other${skipped > 1 ? "s were" : " was"} skipped because ${skipped > 1 ? "they're" : "it's"} already invoiced for this period.` : ""}\n\nApprove to create them as **draft** invoices — you can review and confirm them on the Invoices page.`,
    tool_calls: [...calls, tool("create_invoice_drafts", { count: ready.length, dry_run: true }, "preview ready")],
    pending_action: {
      id: actionId,
      type: "generate_invoices",
      title: `Create ${ready.length} draft invoice${ready.length > 1 ? "s" : ""}`,
      description: "Amounts are calculated by the billing engine.",
      preview: ready.map((r) => ({
        label: `${r.customer_name} · ${r.subscription_number}`,
        detail: `${r.plan_name} · ${inr(r.estimated_total)}`,
      })),
      confirm_label: "Approve & create",
    },
  };
}

function overdue(): AiAssistantReply {
  const rows = billingInsights.overdueInvoices();
  const total = rows.reduce((s, r) => s + r.balance, 0);
  return {
    id: uid("msg"),
    content: rows.length
      ? `There are **${rows.length} overdue invoices** with **${inr(total)}** outstanding. The oldest is **${rows[0].number}** from ${rows[0].customer_name}, ${rows[0].days_overdue} days overdue.`
      : "Good news — no invoices are overdue right now.",
    tool_calls: [tool("get_overdue_invoices", {}, `${rows.length} found`)],
    data: rows.length
      ? {
          kind: "table",
          title: "Overdue invoices",
          columns: [
            { key: "number", label: "Invoice" },
            { key: "customer_name", label: "Customer" },
            { key: "due_date", label: "Due", format: "date" },
            { key: "days_overdue", label: "Days overdue", format: "number", align: "right" },
            { key: "balance", label: "Balance", format: "currency", align: "right" },
          ],
          rows,
          link: { base: "/invoices/", key: "id" },
        }
      : undefined,
    suggestions: ["Which customers owe us the most?"],
  };
}

function mrr(): AiAssistantReply {
  const s = billingInsights.revenueSummary();
  return {
    id: uid("msg"),
    content: `Your **monthly recurring revenue is ${inr(s.mrr)}** across ${s.active_subscriptions} active subscriptions. This month you've collected ${inr(s.collected_this_month)}, and ${inr(s.outstanding)} is still outstanding.`,
    tool_calls: [tool("get_revenue_summary", {}, "summary ready")],
    data: {
      kind: "metrics",
      title: "Revenue summary",
      items: [
        { label: "MRR", value: s.mrr, format: "currency", hint: "after discounts, before tax" },
        { label: "Active subscriptions", value: s.active_subscriptions, format: "number" },
        { label: "Collected this month", value: s.collected_this_month, format: "currency" },
        { label: "Outstanding", value: s.outstanding, format: "currency", hint: `${inr(s.overdue)} overdue` },
      ],
    },
    suggestions: ["Which plan generates the most revenue?", "Show overdue invoices"],
  };
}

function revenueByPlan(): AiAssistantReply {
  const rows = billingInsights.revenueByPlan();
  const top = rows[0];
  return {
    id: uid("msg"),
    content: `**${top.plan_name}** generates the most revenue: ${inr(top.revenue)} collected so far, from ${top.subscriptions} subscriptions (${inr(top.mrr)}/month).`,
    tool_calls: [tool("get_revenue_by_plan", {}, `${rows.length} plans`)],
    data: {
      kind: "bar_chart",
      title: "Revenue collected by plan",
      format: "currency",
      bars: rows.map((r) => ({ label: r.plan_name, value: r.revenue, hint: `${r.subscriptions} subs · ${inr(r.mrr)}/mo` })),
    },
    suggestions: ["What is our MRR?"],
  };
}

function owing(): AiAssistantReply {
  const rows = billingInsights.outstandingByCustomer();
  return {
    id: uid("msg"),
    content: rows.length
      ? `**${rows.length} customers** have unpaid invoices. **${rows[0].customer_name}** owes the most: ${inr(rows[0].balance)}${rows[0].overdue ? `, of which ${inr(rows[0].overdue)} is overdue` : ""}.`
      : "No customer has an unpaid invoice right now.",
    tool_calls: [tool("get_outstanding_by_customer", {}, `${rows.length} customers`)],
    data: rows.length
      ? {
          kind: "table",
          title: "Unpaid balance by customer",
          columns: [
            { key: "customer_name", label: "Customer" },
            { key: "invoices", label: "Unpaid invoices", format: "number", align: "right" },
            { key: "overdue", label: "Overdue", format: "currency", align: "right" },
            { key: "balance", label: "Total owed", format: "currency", align: "right" },
          ],
          rows,
        }
      : undefined,
    suggestions: ["Show overdue invoices"],
  };
}

function help(): AiAssistantReply {
  return {
    id: uid("msg"),
    content:
      "I can look things up and prepare tasks across subscriptions, invoices and payments. For example:\n- Which subscriptions expire this week?\n- Show overdue invoices\n- Generate invoices for subscriptions due today\n- What is our MRR?\n- Which plan generates the most revenue?\n- Prepare renewal reminders\n\nAnything that sends emails or creates invoices waits for your approval.",
    tool_calls: [],
    suggestions: ["What is our MRR?", "Show overdue invoices"],
  };
}

async function route(message: string): Promise<AiAssistantReply> {
  const text = message.toLowerCase();
  if (/remind/.test(text)) return reminders(text);
  if (/expir|renew|ending|ends soon/.test(text)) return expiring(text);
  if (/generat|create|raise|bill/.test(text) && /invoice|bill/.test(text)) return generateInvoices();
  if (/overdue|late|past due/.test(text)) return overdue();
  if (/plan/.test(text) && /revenue|most|best|top|earn/.test(text)) return revenueByPlan();
  if (/owe|owing|unpaid|outstanding|debt/.test(text)) return owing();
  if (/mrr|recurring|revenue|income|earning/.test(text)) return mrr();
  return help();
}

// --- Mock API ------------------------------------------------------------------------

export const mockAi = {
  async chat({ message, conversation_id }: AiChatRequest): Promise<AiChatResponse> {
    await mockDelay(900 + Math.random() * 600); // feels like model + tool latency
    if (!message.trim()) throw new ApiError(422, "Message can't be empty.");
    return { conversation_id: conversation_id ?? uid("conv"), reply: await route(message) };
  },

  async approve(actionId: string): Promise<AiActionResult> {
    const run = pendingActions.get(actionId);
    if (!run) throw new ApiError(404, "This action has expired or was already handled. Ask again to prepare it.");
    pendingActions.delete(actionId);
    return { status: "completed", message: await run() };
  },

  async reject(actionId: string): Promise<AiActionResult> {
    await mockDelay(200);
    pendingActions.delete(actionId);
    return { status: "rejected", message: "Cancelled — nothing was sent or created." };
  },
};
