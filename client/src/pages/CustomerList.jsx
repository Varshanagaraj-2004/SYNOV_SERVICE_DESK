import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { fetchCompanies } from "../api/companies";
import { useAuth } from "../context/useAuth";
import useKeyedState from "../hooks/useKeyedState";

const statusColors = {
  Active: "bg-status-closed",
  Inactive: "bg-status-cancelled",
};
const ROWS_PER_PAGE = 10;

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium text-white ${colorClass}`}>
      {label}
    </span>
  );
}

function openCompanyTickets(companyId) {
  if (!companyId) return;
  window.open(`/admin/companies/${companyId}/tickets`, "_blank", "noopener,noreferrer");
}

export default function CustomerList() {
  const { role } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useKeyedState(query, () => 1);
  const { data: companyPage, isLoading, isError } = useQuery({
    queryKey: ["companies", { page, limit: ROWS_PER_PAGE, q: query.trim() || undefined }],
    queryFn: ({ queryKey }) => fetchCompanies(queryKey[1]),
  });
  const companies = companyPage?.items || [];
  const paginatedCompanies = companies;
  const totalCompanies = companyPage?.total || 0;
  const totalPages = companyPage?.pages || 0;
  const currentPage = companyPage?.page || page;

  if (isLoading) return <p className="text-text-secondary">Loading customers...</p>;
  if (isError) return <p className="text-status-critical">Couldn't load customers. Check the backend is running.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Customer List</h2>
          <p className="text-sm text-text-secondary mt-1">
            {totalCompanies} total customers
          </p>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search companies..."
          className="w-full rounded-lg border border-surface-border py-2 pl-9 pr-3 text-sm focus:outline-none"
        />
      </div>

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
              {role === "admin" && <th className="px-5 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedCompanies.map((customer) => (
              <tr
                key={customer._id}
                className="border-t border-surface-border hover:bg-surface-muted/50 transition-colors"
              >
                <td className="px-5 py-4 font-medium text-brand-purple">{customer.crmId || customer._id}</td>
                <td className="px-5 py-4 text-text-primary">
                  <button
                    type="button"
                    onClick={() => openCompanyTickets(customer._id)}
                    className="text-left font-medium text-brand-purple hover:underline"
                  >
                    {customer.companyName}
                  </button>
                </td>
                <td className="px-5 py-4 text-text-secondary">{customer.department || "—"}</td>
                <td className="px-5 py-4 text-text-secondary">{customer.location}</td>
                <td className="px-5 py-4 text-text-primary">{customer.contactPerson}</td>
                <td className="px-5 py-4 text-text-secondary">{customer.contactNumber}</td>
                <td className="px-5 py-4">
                  <Badge label={customer.status} colorClass={statusColors[customer.status]} />
                </td>
                {role === "admin" && (
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/customers/${customer._id}/users`}
                      className="inline-flex items-center rounded-lg border border-surface-border bg-surface-page px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                    >
                      View Users
                    </Link>
                  </td>
                )}
              </tr>
            ))}

            {companies.length === 0 && (
              <tr>
                <td colSpan={role === "admin" ? 8 : 7} className="px-5 py-8 text-center text-text-secondary">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCompanies > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, totalCompanies)} of {totalCompanies}
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
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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