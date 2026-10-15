import { useQuery } from "@tanstack/react-query";
import {
  fetchInventoryAssets,
  fetchRentedInventoryAssets,
} from "../api/assets";
import { useAuth } from "../context/useAuth";

function InventoryError({ error, onRetry, section, colSpan }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-5 py-8 text-center text-status-critical"
      >
        <p>Couldn't load {section} assets.</p>
        {error?.response?.data?.reason && (
          <p className="mt-1 text-sm">
            Reason: {error.response.data.reason}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded bg-brand-purple px-3 py-1 text-sm text-white hover:opacity-90"
        >
          Retry
        </button>
      </td>
    </tr>
  );
}

export default function Assets() {
  const { role } = useAuth();
  const isClient = role === "client";

  const {
    data: inventoryAssets = [],
    isLoading: inventoryLoading,
    isError: inventoryError,
    error: inventoryQueryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ["inventory-assets"],
    queryFn: fetchInventoryAssets,
    retry: false,
  });

  const {
    data: rentedInventoryAssets = [],
    isLoading: rentedLoading,
    isError: rentedError,
    error: rentedQueryError,
    refetch: refetchRentedInventory,
  } = useQuery({
    queryKey: ["inventory-rented-assets"],
    queryFn: fetchRentedInventoryAssets,
    enabled: !isClient,
    retry: false,
  });

  if (isClient) {
    return (
      <div>
        <h2 className="mb-6 text-xl font-semibold text-text-primary">
          My Assets
        </h2>

        {inventoryLoading && (
          <p className="text-text-secondary">Loading your assets...</p>
        )}

        {inventoryError && (
          <div className="text-status-critical">
            <p>Couldn't load your assets.</p>
            {inventoryQueryError?.response?.data?.reason && (
              <p className="mt-1 text-sm">
                Reason: {inventoryQueryError.response.data.reason}
              </p>
            )}
            <button
              type="button"
              onClick={() => refetchInventory()}
              className="mt-2 rounded bg-brand-purple px-3 py-1 text-sm text-white hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {!inventoryLoading && !inventoryError && inventoryAssets.length === 0 && (
          <p className="text-text-secondary">
            No assets have been assigned to your company yet.
          </p>
        )}

        {!inventoryLoading && !inventoryError && inventoryAssets.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-secondary">
                    <th className="px-5 py-3 font-medium">Asset ID</th>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Serial Number</th>
                    <th className="px-5 py-3 font-medium">Model</th>
                    <th className="px-5 py-3 font-medium">Location</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryAssets.map((asset) => (
                    <tr
                      key={asset.id || asset.assetId || asset.serialNumber}
                      className="border-t border-surface-border"
                    >
                      <td className="px-5 py-4 font-medium text-brand-purple">
                        {asset.assetId || asset.id || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-primary">
                        {asset.productName || asset.name || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.serialNumber || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.productModel || asset.type || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.location || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-primary">
                        {asset.status || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const emptyMessage = "No Inventory assets found.";

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-text-primary">Assets</h2>

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-text-primary">
            Inventory Assets
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Assets fetched directly from the Inventory module
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3 font-medium">Asset ID</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Serial Number</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {inventoryLoading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-text-secondary"
                    >
                      Loading Inventory assets...
                    </td>
                  </tr>
                )}

                {inventoryError && (
                  <InventoryError
                    error={inventoryQueryError}
                    onRetry={() => refetchInventory()}
                    section="Inventory"
                    colSpan={7}
                  />
                )}

                {!inventoryLoading &&
                  !inventoryError &&
                  inventoryAssets.map((asset) => (
                    <tr
                      key={asset.id || asset.assetId || asset.serialNumber}
                      className="border-t border-surface-border transition-colors hover:bg-surface-muted/50"
                    >
                      <td className="px-5 py-4 font-medium text-brand-purple">
                        {asset.assetId || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-primary">
                        {asset.productName || asset.name || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.serialNumber || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.productModel || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.location || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.customerName || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block rounded-full bg-status-assigned px-2.5 py-1 text-xs font-medium text-white">
                          {asset.status || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}

                {!inventoryLoading &&
                  !inventoryError &&
                  inventoryAssets.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-text-secondary"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-text-primary">
            Rent Out Assets
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Assets currently rented from the Inventory module
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3 font-medium">Asset ID</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Serial Number</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Start Date</th>
                  <th className="px-5 py-3 font-medium">End Date</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rentedLoading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-8 text-center text-text-secondary"
                    >
                      Loading Rent Out assets...
                    </td>
                  </tr>
                )}

                {rentedError && (
                  <InventoryError
                    error={rentedQueryError}
                    onRetry={() => refetchRentedInventory()}
                    section="Rent Out"
                    colSpan={8}
                  />
                )}

                {!rentedLoading &&
                  !rentedError &&
                  rentedInventoryAssets.map((asset) => (
                    <tr
                      key={asset.id || asset.assetId || asset.serialNumber}
                      className="border-t border-surface-border transition-colors hover:bg-surface-muted/50"
                    >
                      <td className="px-5 py-4 font-medium text-brand-purple">
                        {asset.assetId || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-primary">
                        {asset.productName || asset.name || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.serialNumber || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-primary">
                        {asset.customerName || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.rentStartDate || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.rentEndDate || "-"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {asset.location || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block rounded-full bg-status-assigned px-2.5 py-1 text-xs font-medium text-white">
                          {asset.status || "rented"}
                        </span>
                      </td>
                    </tr>
                  ))}

                {!rentedLoading &&
                  !rentedError &&
                  rentedInventoryAssets.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-text-secondary"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
