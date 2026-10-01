import axiosClient from "./axiosClient";

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

export async function createAsset(payload) {
  const { data } = await axiosClient.post("/assets", payload);
  return data;
}

export async function updateAsset(id, payload) {
  const { data } = await axiosClient.patch(`/assets/${id}`, payload);
  return data;
}

export async function deleteAsset(id) {
  const { data } = await axiosClient.delete(`/assets/${id}`);
  return data;
}