import type { WebsitePreviewProduct, WebsiteProductFrame } from "@/lib/website/website-model";
import { ProductImageStage } from "@/components/products/product-image-stage";

function formatMoney(price: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price);
  } catch {
    const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
    return `${amount} ${currency}`;
  }
}

function productPhotos(product: WebsitePreviewProduct): string[] {
  if (product.imageUrls?.length) return product.imageUrls.slice(0, 5);
  return product.imageUrl ? [product.imageUrl] : [];
}

function ProductPhoto({
  name,
  images,
  accent,
  className,
}: {
  name: string;
  images: string[];
  accent?: string;
  className: string;
}) {
  if (images.length > 1) return <ProductImageStage images={images} alt={name} className={className} />;
  if (images.length === 1) return <img src={images[0]} alt="" className={`${className} object-cover`} />;
  return (
    <div
      className={`${className} flex items-center justify-center bg-muted text-xl font-semibold`}
      style={{ background: accent ? `linear-gradient(145deg, ${accent}, ${accent}99)` : undefined }}
      aria-hidden
    >
      <span className={accent ? "text-white" : "text-muted-foreground"}>{name.trim().charAt(0).toUpperCase() || "•"}</span>
    </div>
  );
}

function Price({ price, currency, language, accent }: { price: number; currency: string; language: string; accent?: string }) {
  if (!(price > 0)) return null;
  return (
    <p className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
      {formatMoney(price, currency, language)}
    </p>
  );
}

export function WebsiteProductShowcase({
  products,
  frame,
  showPrice,
  accent,
  language,
  title,
  empty,
  selectedId,
  onSelect,
}: {
  products: WebsitePreviewProduct[];
  frame: WebsiteProductFrame;
  showPrice: boolean;
  accent?: string;
  language: string;
  title: string;
  empty: string;
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const price = (product: WebsitePreviewProduct) =>
    showPrice ? <Price price={product.price} currency={product.currency} language={language} accent={accent} /> : null;
  const choose = (id: string) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect?.(id);
  };
  const ring = (id: string) => (selectedId === id ? "ring-2 ring-primary" : "");

  return (
    <section>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      </div>
      {products.length === 0 ? <p className="mt-6 text-center text-sm text-muted-foreground">{empty}</p> : null}
      {products.length > 0 && frame === "catalog" ? (
        <ul className="mx-auto mt-8 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
          {products.map((product) => (
            <li key={product.id}>
              <button type="button" className={`grid w-full gap-4 p-4 text-start @md:grid-cols-[7.5rem_minmax(0,1fr)_auto] @md:items-center ${ring(product.id)}`} onClick={choose(product.id)}>
                <ProductPhoto name={product.name} images={productPhotos(product)} accent={accent} className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted @md:aspect-square" />
                <span>
                  <span className="block font-medium">{product.name}</span>
                  {product.description ? <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{product.description}</span> : null}
                </span>
                {price(product)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {products.length > 0 && frame === "list" ? (
        <ul className="mx-auto mt-8 max-w-2xl space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <button type="button" className={`flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-start ${ring(product.id)}`} onClick={choose(product.id)}>
                <ProductPhoto name={product.name} images={productPhotos(product)} accent={accent} className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{product.name}</span>
                  {product.description ? <span className="block truncate text-sm text-muted-foreground">{product.description}</span> : null}
                </span>
                {price(product)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {products.length > 0 && frame === "tiles" ? (
        <ul className="mt-8 grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <button type="button" className={`group relative block aspect-square w-full overflow-hidden rounded-2xl ${ring(product.id)}`} onClick={choose(product.id)}>
                <ProductPhoto name={product.name} images={productPhotos(product)} accent={accent} className="absolute inset-0 h-full w-full bg-muted" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 text-start text-white">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  {product.description ? <span className="mt-0.5 block truncate text-xs text-white/80">{product.description}</span> : null}
                  {showPrice && product.price > 0 ? <span className="mt-0.5 block text-xs tabular-nums">{formatMoney(product.price, product.currency, language)}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {products.length > 0 && frame === "spotlight" ? (
        <div className="mt-8 space-y-4">
          <button type="button" className={`grid w-full overflow-hidden rounded-3xl border border-border bg-card text-start @3xl:grid-cols-2 ${ring(products[0].id)}`} onClick={choose(products[0].id)}>
            <ProductPhoto name={products[0].name} images={productPhotos(products[0])} accent={accent} className="aspect-[4/3] w-full bg-muted @3xl:aspect-auto @3xl:min-h-72" />
            <span className="flex flex-col justify-center gap-3 p-6 @3xl:p-10">
              <span className="text-2xl font-semibold">{products[0].name}</span>
              {products[0].description ? <span className="text-sm leading-7 text-muted-foreground">{products[0].description}</span> : null}
              {price(products[0])}
            </span>
          </button>
          {products.length > 1 ? (
            <ul className="grid gap-3 @md:grid-cols-3">
              {products.slice(1).map((product) => (
                <li key={product.id}>
                  <button type="button" className={`w-full overflow-hidden rounded-2xl border border-border bg-card text-start ${ring(product.id)}`} onClick={choose(product.id)}>
                    <ProductPhoto name={product.name} images={productPhotos(product)} accent={accent} className="aspect-[4/3] w-full bg-muted" />
                    <span className="block space-y-1 p-3">
                      <span className="block truncate font-medium">{product.name}</span>
                      {product.description ? <span className="block truncate text-sm text-muted-foreground">{product.description}</span> : null}
                      {price(product)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {products.length > 0 && (frame === "shelf" || !["catalog", "list", "tiles", "spotlight"].includes(frame)) ? (
        <ul className="mt-8 grid gap-5 @md:grid-cols-2 @3xl:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <button type="button" className={`w-full overflow-hidden rounded-3xl border border-border bg-card text-start shadow-sm ${ring(product.id)}`} onClick={choose(product.id)}>
                <ProductPhoto name={product.name} images={productPhotos(product)} accent={accent} className="aspect-[4/3] w-full bg-muted" />
                <span className="block space-y-2 p-5">
                  <span className="block text-lg font-semibold">{product.name}</span>
                  {product.description ? <span className="block line-clamp-2 text-sm leading-6 text-muted-foreground">{product.description}</span> : null}
                  {price(product)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const PRODUCT_FRAMES: WebsiteProductFrame[] = ["shelf", "catalog", "spotlight", "list", "tiles"];

export function ProductFramePicker({
  value,
  locked,
  label,
  name,
  onChange,
}: {
  value: WebsiteProductFrame;
  locked: boolean;
  label: (frame: WebsiteProductFrame) => string;
  name: string;
  onChange: (frame: WebsiteProductFrame) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{name}</p>
      <div className="grid grid-cols-2 gap-2">
        {PRODUCT_FRAMES.map((frame) => (
          <button
            key={frame}
            type="button"
            disabled={locked}
            className={`rounded-xl border p-2 text-start ${value === frame ? "border-primary bg-primary/10" : "hover:border-primary"}`}
            onClick={() => onChange(frame)}
          >
            <FrameSketch frame={frame} />
            <span className="mt-2 block text-xs font-medium">{label(frame)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FrameSketch({ frame }: { frame: WebsiteProductFrame }) {
  if (frame === "catalog") {
    return (
      <span className="grid gap-1" aria-hidden>
        <span className="h-2 rounded bg-foreground/15" />
        <span className="h-2 rounded bg-foreground/15" />
        <span className="h-2 rounded bg-foreground/15" />
      </span>
    );
  }
  if (frame === "list") {
    return (
      <span className="grid gap-1" aria-hidden>
        <span className="h-1.5 w-3/4 rounded bg-foreground/20" />
        <span className="h-1.5 w-2/3 rounded bg-foreground/15" />
        <span className="h-1.5 w-4/5 rounded bg-foreground/15" />
      </span>
    );
  }
  if (frame === "tiles") {
    return (
      <span className="grid grid-cols-4 gap-1" aria-hidden>
        <span className="aspect-square rounded bg-foreground/20" />
        <span className="aspect-square rounded bg-foreground/15" />
        <span className="aspect-square rounded bg-foreground/15" />
        <span className="aspect-square rounded bg-foreground/10" />
      </span>
    );
  }
  if (frame === "spotlight") {
    return (
      <span className="grid grid-cols-[1.4fr_1fr] gap-1" aria-hidden>
        <span className="h-8 rounded bg-foreground/20" />
        <span className="grid gap-1">
          <span className="h-2 rounded bg-foreground/15" />
          <span className="h-2 rounded bg-foreground/10" />
        </span>
      </span>
    );
  }
  return (
    <span className="grid grid-cols-3 gap-1" aria-hidden>
      <span className="h-8 rounded bg-foreground/20" />
      <span className="h-8 rounded bg-foreground/15" />
      <span className="h-8 rounded bg-foreground/10" />
    </span>
  );
}
