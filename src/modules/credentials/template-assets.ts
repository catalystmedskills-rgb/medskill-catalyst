import { CredentialError } from "./errors";

type UploadedAsset = { path: string; sha256: string; mime: string };

/** Resolve upload-slot references to the server's content-addressed asset metadata. */
export function resolveTemplateAssets(value: unknown, assets: Record<string, UploadedAsset>): unknown {
  const lookup = (reference: string) => {
    const asset = assets[reference.slice(6)];
    if (!asset) throw new CredentialError(`Layout references ${reference} but no file was uploaded in that slot.`, "VALIDATION");
    return asset;
  };
  if (typeof value === "string" && value.startsWith("asset:")) return lookup(value);
  if (Array.isArray(value)) return value.map((item) => resolveTemplateAssets(item, assets));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    // Font references carry a kind discriminator. Resolve the entire reference,
    // not just its path: the uploaded bytes determine both path and digest.
    if (object.kind === "asset" && typeof object.path === "string" && object.path.startsWith("asset:")) {
      const asset = lookup(object.path);
      if (asset.mime !== "font/ttf" && asset.mime !== "font/otf") {
        throw new CredentialError("A font reference must point to a TTF or OTF upload.", "VALIDATION");
      }
      return { kind: "asset", path: asset.path, sha256: asset.sha256 };
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, resolveTemplateAssets(item, assets)]));
  }
  return value;
}
