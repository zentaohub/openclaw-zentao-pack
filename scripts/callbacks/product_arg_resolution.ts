export interface ProductMatchCandidate {
  id: string;
  name: string;
}

export interface ProductArgResolutionState {
  status: "unchanged" | "resolved" | "ambiguous" | "unmatched";
  args: Record<string, string>;
  rawProduct?: string;
  matches?: ProductMatchCandidate[];
}

interface ResolveProductArgOptions {
  routeNeedsProduct: boolean;
  text: string;
  args: Record<string, string>;
  lookupMatches: (text: string) => Promise<ProductMatchCandidate[]>;
}

export function isPositiveIntegerArg(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!/^\d+$/u.test(normalized)) {
    return false;
  }

  return Number.parseInt(normalized, 10) > 0;
}

export async function resolveProductArg(options: ResolveProductArgOptions): Promise<ProductArgResolutionState> {
  const rawProduct = typeof options.args.product === "string" ? options.args.product.trim() : "";
  if (!options.routeNeedsProduct) {
    return {
      status: "unchanged",
      args: options.args,
      rawProduct: rawProduct || undefined,
    };
  }

  if (isPositiveIntegerArg(rawProduct)) {
    return {
      status: "unchanged",
      args: {
        ...options.args,
        product: rawProduct,
      },
      rawProduct,
    };
  }

  const lookupText = rawProduct && !options.text.includes(rawProduct)
    ? `${options.text} ${rawProduct}`
    : options.text;
  const matches = await options.lookupMatches(lookupText);

  if (matches.length === 1) {
    return {
      status: "resolved",
      args: {
        ...options.args,
        product: matches[0].id,
      },
      rawProduct: rawProduct || undefined,
      matches,
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      args: options.args,
      rawProduct: rawProduct || undefined,
      matches,
    };
  }

  if (rawProduct) {
    const { product: _product, ...restArgs } = options.args;
    return {
      status: "unmatched",
      args: restArgs,
      rawProduct,
    };
  }

  return {
    status: "unchanged",
    args: options.args,
  };
}
