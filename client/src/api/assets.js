import axiosClient from "./axiosClient";

// =====================================================
// SERVICE DESK ASSET APIs
// =====================================================

export async function fetchAssets(params = {}) {
  const { data } = await axiosClient.get("/assets", { params });
  return data;
}

export async function fetchAllAssets() {
  const limit = 100;
  const firstPage = await fetchAssets({ page: 1, limit });
  const assets = [...firstPage.items];

  for (let page = 2; page <= firstPage.pages; page += 1) {
    const result = await fetchAssets({ page, limit });
    assets.push(...result.items);
  }

  return assets;
}

// =====================================================
// INVENTORY APIs
// =====================================================

// Fetch ALL assets from Inventory
export async function fetchInventoryAssets() {
  const { data } = await axiosClient.get("/crm/inventory-assets");
  return data;
}

// Fetch only RENT OUT assets from Inventory
export async function fetchRentedInventoryAssets() {
  const { data } = await axiosClient.get("/crm/inventory-assets", {
    params: { status: "rented" },
  });
  return data;
}