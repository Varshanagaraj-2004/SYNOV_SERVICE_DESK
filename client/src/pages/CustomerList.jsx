import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { fetchCustomers } from "../api/customers";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import useKeyedState from "../hooks/useKeyedState";

const statusColors = {
  Active: "bg-status-closed",
  Inactive: "bg-status-cancelled",
};

const ROWS_PER_PAGE = 10;

function Badge({ label, colorClass }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white ${colorClass || "bg-gray-500"}`}
    >
      {label || "—"}
    </span>
  );
}

// The CRM response shape is not confirmed yet, so accept the common ones.
function getCustomerList(response) {
  if (Array.isArray(response)) return response;
  return (
    response?.data ||
    response?.items ||
    response?.customers ||
    []
  );
}

export default function CustomerList() {
  const { role, token } = useAuth();

  const [query, setQuery] = useState("");
  const [page, setPage] = useKeyedState(query, () => 1);

  const {
    data: customerResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      "crm-customers",
      {
        page,
        limit: ROWS_PER_PAGE,
        search: query.trim(),
      },
    ],

    // Calls YOUR backend (/api/crm/customers). Never the CRM directly.
    queryFn: () =>
      fetchCustomers({
        page,
        limit: ROWS_PER_PAGE,
        search: query.trim(),
      }),

    enabled: !!token,
    retry: false,
  });

  const customers = getCustomerList(customerResponse);
  const pagination = customerResponse?.pagination || {};

  const totalCustomers =
    pagination.total ?? customerResponse?.total ?? customers.length;
  const totalPages =
    pagination.totalPages ?? customerResponse?.pages ?? 1;
  const currentPage = pagination.page ?? customerResponse?.page ?? page;

  if (!token) {
    return (
      <p className="text-status-critical">
        Please log in to access customer information.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-text-secondary">
        Loading customers...
      </p>
    );
  }

  if (isError) {
    console.error("Customer API error:", error);

    const status = error?.response?.status;
    const detail = error?.response?.data?.error;
    const reason = error?.response?.data?.reason;

    return (
      <div className="text-status-critical">
        <p>Couldn't load customers.</p>
        <p className="text-sm mt-1">
          {status ? `Error ${status}. ` : ""}
          {detail || "Please check your login and the CRM connection."}
          {reason ? ` Reason: ${reason}.` : ""}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="mt-2 rounded bg-brand-purple px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-60"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            Customer List
          </h2>

          <p className="text-sm text-text-secondary mt-1">
            {totalCustomers} total customers
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
        />

        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search customers..."
          className="w-full rounded-lg border border-surface-border py-2 pl-9 pr-3 text-sm focus:outline-none"
        />
      </div>

      {/* Customer Table */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-text-secondary text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Customer ID</th>
              <th className="px-5 py-3 font-medium">Company Name</th>
              <th className="px-5 py-3 font-medium">Department</th>
              <th className="px-5 py-3 font-medium">Location</th>
              <th className="px-5 py-3 font-medium">Contact Person</th>
              <th className="px-5 py-3 font-medium">Contact Number</th>
              <th className="px-5 py-3 font-medium">Status</th>

              {role === "admin" && (
                <th className="px-5 py-3 font-medium text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer._id || customer.customerId || customer.id}
                className="border-t border-surface-border hover:bg-surface-muted/50 transition-colors"
              >
                {/* Customer ID */}
                <td className="px-5 py-4 font-medium text-brand-purple">
                  {customer.customerId || customer._id || "—"}
                </td>

                {/* Company Name */}
                <td className="px-5 py-4 text-text-primary">
                  {customer.companyName || "—"}
                </td>

                {/* Department */}
                <td className="px-5 py-4 text-text-secondary">
                  {customer.department || "—"}
                </td>

                {/* Location */}
                <td className="px-5 py-4 text-text-secondary">
                  {customer.state || customer.location || "—"}
                </td>

                {/* Contact Person */}
                <td className="px-5 py-4 text-text-primary">
                  {customer.customerName || customer.contactPerson || "—"}
                </td>

                {/* Contact Number */}
                <td className="px-5 py-4 text-text-secondary">
                  {customer.phone || customer.contactNumber || "—"}
                </td>

                {/* Status */}
                <td className="px-5 py-4">
                  <Badge
                    label={customer.status}
                    colorClass={statusColors[customer.status]}
                  />
                </td>

                {/* Actions */}
                {role === "admin" && (
                  <td className="px-5 py-4 text-right">
                    {customer.localCompanyId ? (
                      <Link
                        to={`/customers/${customer.localCompanyId}/users`}
                        className="inline-flex items-center rounded-lg border border-surface-border bg-surface-page px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                      >
                        View Users
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title="The local company record is not available"
                        className="inline-flex items-center rounded-lg border border-surface-border px-3 py-2 text-xs font-medium text-text-secondary opacity-50"
                      >
                        View Users
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {customers.length === 0 && (
              <tr>
                <td
                  colSpan={role === "admin" ? 8 : 7}
                  className="px-5 py-8 text-center text-text-secondary"
                >
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCustomers > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–
            {Math.min(currentPage * ROWS_PER_PAGE, totalCustomers)} of{" "}
            {totalCustomers}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <span className="text-sm text-text-secondary">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={currentPage === totalPages}
              className="border border-surface-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-page transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
