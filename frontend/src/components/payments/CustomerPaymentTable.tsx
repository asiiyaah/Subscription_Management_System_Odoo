import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PaymentMethodBadge } from "@/components/payments/PaymentMethodBadge";
import { useListQuery } from "@/hooks/useListQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import { paymentService } from "@/services/paymentService";
import type { Id } from "@/types/common";
import type { PaymentListQuery, PaymentRow } from "@/types/payment";

export function CustomerPaymentTable({ customerId }: { customerId: Id }) {
  const navigate = useNavigate();
  const list = useListQuery({ pageSize: 10, sortBy: "payment_date", sortDir: "desc", inUrl: false });
  const query = { ...list.query, customer_id: customerId } as PaymentListQuery;
  const payments = useQuery({
    queryKey: ["payments", "customer", customerId, query],
    queryFn: () => paymentService.list(query),
    placeholderData: keepPreviousData,
  });
  const columns: Column<PaymentRow>[] = [
    { key: "number", header: "Payment", sortable: true, render: (row) => <span className="font-semibold">{row.number}</span> },
    { key: "payment_date", header: "Date", sortable: true, render: (row) => formatDate(row.payment_date) },
    { key: "invoice_number", header: "Invoice", render: (row) => row.invoice_number },
    { key: "method", header: "Method", render: (row) => <PaymentMethodBadge method={row.method} /> },
    { key: "amount", header: "Amount", sortable: true, align: "right", render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span> },
  ];
  return <DataTable columns={columns} data={payments.data} isLoading={payments.isPending} isFetching={payments.isFetching}
    isError={payments.isError} errorMessage={payments.error?.message} onRetry={() => void payments.refetch()}
    list={list} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/invoices/${row.invoice_id}`)}
    searchPlaceholder="Search payments…" empty={{ title: "No payments recorded", description: "Payments for this customer will appear here." }} />;
}
