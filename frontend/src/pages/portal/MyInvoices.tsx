import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, FileText, Printer } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs } from "@/components/common/Tabs";
import { invoiceColumns } from "@/components/invoices/invoiceColumns";
import { useListQuery } from "@/hooks/useListQuery";
import { portalService } from "@/services/portalService";
import type { InvoiceListQuery } from "@/types/invoice";

const COLUMNS = invoiceColumns({ showCustomer: false });

/** My invoices (C3): only the signed-in customer's invoices, never drafts. */
export default function MyInvoices() {
  const navigate = useNavigate();
  const list = useListQuery({ sortBy: "invoice_date", sortDir: "desc" });
  const query = list.query as InvoiceListQuery & { unpaid?: "true" };

  const invoices = useQuery({
    queryKey: ["portal", "invoices", query],
    queryFn: () => portalService.invoices(query),
    placeholderData: keepPreviousData,
  });

  const tab = query.unpaid === "true" ? "unpaid" : query.status === "paid" ? "paid" : "";
  function changeTab(value: string) {
    list.setFilters({ unpaid: value === "unpaid" ? "true" : undefined, status: value === "paid" ? "paid" : undefined });
  }

  return (
    <>
      <PageHeader title="My invoices" description="Open any invoice to see the details, print it or save it as PDF." />
      <div className="space-y-4">
        <Tabs
          aria-label="Filter invoices"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "", label: "All" },
            { value: "unpaid", label: "To pay" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <DataTable
          columns={COLUMNS}
          data={invoices.data}
          isLoading={invoices.isPending}
          isFetching={invoices.isFetching}
          isError={invoices.isError}
          errorMessage={invoices.error?.message}
          onRetry={() => invoices.refetch()}
          list={list}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/portal/invoices/${row.id}`)}
          rowActions={(row) => [
            { label: "View", icon: <Eye />, onSelect: () => navigate(`/portal/invoices/${row.id}`) },
            { label: "Print / save PDF", icon: <Printer />, onSelect: () => navigate(`/portal/invoices/${row.id}?print=1`) },
          ]}
          searchPlaceholder="Search invoice number…"
          empty={{ icon: <FileText />, title: "No invoices yet", description: "Your invoices will appear here once you're billed." }}
        />
      </div>
    </>
  );
}
