import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { invoiceColumns } from "@/components/invoices/invoiceColumns";
import { useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { useListQuery } from "@/hooks/useListQuery";
import { invoiceService } from "@/services/invoiceService";
import type { Id } from "@/types/common";

interface InvoiceTableProps {
  /** Show only this customer's invoices (customer detail page). */
  customerId?: Id;
  /** Show only this subscription's invoices (subscription detail page). */
  subscriptionId?: Id;
  pageSize?: number;
}

/**
 * Invoices embedded in another page, e.g. for Member 1:
 *   <InvoiceTable subscriptionId={subscription.id} />
 *   <InvoiceTable customerId={customer.id} />
 * Includes row actions (confirm, pay, send, print, cancel). State is local, not in the URL.
 */
export function InvoiceTable({ customerId, subscriptionId, pageSize = 5 }: InvoiceTableProps) {
  const navigate = useNavigate();
  const list = useListQuery({ pageSize, sortBy: "invoice_date", sortDir: "desc", inUrl: false });
  const { menuFor, dialogs } = useInvoiceActions();

  const query = { ...list.query, customer_id: customerId, subscription_id: subscriptionId };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["invoices", "list", query],
    queryFn: () => invoiceService.list(query),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <DataTable
        columns={invoiceColumns({ showCustomer: !customerId, showSubscription: !subscriptionId })}
        data={data}
        isLoading={isPending}
        isFetching={isFetching}
        isError={isError}
        onRetry={() => refetch()}
        list={list}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/invoices/${row.id}`)}
        rowActions={menuFor}
        searchPlaceholder={false}
        empty={{ icon: <FileText />, title: "No invoices yet", description: "Invoices appear here once this is billed." }}
      />
      {dialogs}
    </>
  );
}
