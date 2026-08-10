import type { ThemeBuild, ThemeExportInput, ThemeFile } from './types';
import { SHOPIFY_THEME_VERSION } from './config';
import {
  buildTemplateJsonFromReferences,
  convertPageToSections,
  extractImageUrls,
  slugify,
  type ConvertedContent,
  type TemplateSectionReference,
  templateBaseName,
} from './liquid';

/**
 * Assemble a complete, uploadable Shopify theme from the generated pages
 * (AGENTS.md §10). Produces every required folder and file — assets, config,
 * layout, locales, sections, snippets, templates, templates/customers — with the
 * user's designed pages wired into real templates + sections, and valid
 * placeholders filling the standard templates Shopify expects so the ZIP uploads
 * without missing-template errors.
 */

/** Standard templates a live storefront routes to; placeholders fill any gaps. */
const REQUIRED_TEMPLATES = [
  'index',
  'product',
  'collection',
  'list-collections',
  'page',
  'blog',
  'article',
  'cart',
  'search',
  '404',
  'gift_card',
  'password',
];

/** Customer-account templates (templates/customers/*). */
const CUSTOMER_TEMPLATES = [
  'account',
  'activate_account',
  'addresses',
  'login',
  'order',
  'register',
  'reset_password',
];

function normalizedPagePath(path: string, type: ThemeExportInput['pages'][number]['type']): string {
  const trimmed = (path || '').trim();
  if (trimmed) return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  switch (type) {
    case 'home':
      return '/';
    case 'product':
      return '/products/all';
    case 'collection':
      return '/collections/all';
    case 'cart':
      return '/cart';
    default:
      return '/pages/custom';
  }
}

function text(path: string, contents: string): ThemeFile {
  return { path, contents };
}

/** Pull the first `--brand`-style hex colour out of the theme CSS, if any. */
function pickColor(css: string, variable: string, fallback: string): string {
  const re = new RegExp(`--${variable}\\s*:\\s*(#[0-9a-fA-F]{3,8})`);
  const m = re.exec(css || '');
  return m ? m[1] : fallback;
}

function layoutTheme(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="{{ settings.brand_color }}">
    <title>{{ page_title }}{% unless page_title contains shop.name %} &middot; {{ shop.name }}{% endunless %}</title>
    <link rel="canonical" href="{{ canonical_url }}">
    {% render 'meta-tags' %}
    {{ 'tailwind.css' | asset_url | stylesheet_tag }}
    {{ 'theme.css' | asset_url | stylesheet_tag }}
    {{ content_for_header }}
  </head>
  <body class="bg-white text-gray-900 antialiased" data-theme="${slugify(projectName, 'theme')}">
    <main id="main-content" role="main">
      {{ content_for_layout }}
    </main>
  </body>
</html>
`;
}

function metaSnippet(): string {
  return `{%- comment -%}
  Basic document meta. Extend with Open Graph / Twitter tags as needed.
{%- endcomment -%}
<meta name="description" content="{{ page_description | default: shop.description | escape }}">
`;
}

function priceSnippet(): string {
  return `<span class="text-base font-semibold text-gray-900">
  {{ amount | money }}
</span>
`;
}

function productCardSnippet(): string {
  return `<article class="group flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
  <a href="{{ product.url }}" class="block overflow-hidden bg-gray-100">
    {% if product.featured_image %}
      {{
        product.featured_image
        | image_url: width: 960
        | image_tag:
          loading: 'lazy',
          widths: '320, 480, 640, 960',
          sizes: '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 100vw',
          alt: product.featured_image.alt | default: product.title,
          class: 'h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]'
      }}
    {% else %}
      <div class="flex h-72 items-center justify-center bg-gray-100 text-sm text-gray-500">
        {{ 'product-1' | placeholder_svg_tag: 'h-20 w-20 opacity-50' }}
      </div>
    {% endif %}
  </a>
  <div class="flex flex-1 flex-col gap-3 p-5">
    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {{ product.vendor }}
      </p>
      <h3 class="text-lg font-semibold text-gray-900">
        <a href="{{ product.url }}">{{ product.title }}</a>
      </h3>
    </div>
    <div class="mt-auto flex items-center justify-between gap-3">
      {% render 'price', amount: product.price %}
      {% if product.available %}
        <span class="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
          {{ 'products.product.in_stock' | t }}
        </span>
      {% else %}
        <span class="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
          {{ 'products.product.sold_out' | t }}
        </span>
      {% endif %}
    </div>
  </div>
</article>
`;
}

function collectionCardSnippet(): string {
  return `<article class="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
  <a href="{{ collection.url }}" class="block">
    <div class="overflow-hidden bg-gray-100">
      {% if collection.featured_image %}
        {{
          collection.featured_image
          | image_url: width: 960
          | image_tag:
            loading: 'lazy',
            widths: '320, 480, 640, 960',
            sizes: '(min-width: 1024px) 33vw, 100vw',
            alt: collection.title,
            class: 'h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]'
        }}
      {% else %}
        <div class="flex h-72 items-center justify-center bg-gray-100 text-sm text-gray-500">
          {{ 'collection-1' | placeholder_svg_tag: 'h-20 w-20 opacity-50' }}
        </div>
      {% endif %}
    </div>
    <div class="space-y-2 p-5">
      <h3 class="text-xl font-semibold text-gray-900">{{ collection.title }}</h3>
      {% if collection.description != blank %}
        <div class="line-clamp-3 text-sm leading-6 text-gray-600">
          {{ collection.description | strip_html | truncate: 180 }}
        </div>
      {% endif %}
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {{ collection.products_count }} products
      </p>
    </div>
  </a>
</article>
`;
}

function headerSection(pageLinks: Array<{ title: string; url: string }>): string {
  const blocks = pageLinks.slice(0, 8).map((link) => ({
    type: 'link',
    name: link.title.slice(0, 30),
    settings: [
      { type: 'text', id: 'label', label: 'Label', default: link.title },
      { type: 'url', id: 'url', label: 'Link' },
    ],
  }));

  const schema = {
    name: 'Theme header',
    class: 'shopify-section-header',
    max_blocks: 8,
    settings: [
      { type: 'text', id: 'brand_name', label: 'Brand name', default: 'Storefront' },
      { type: 'checkbox', id: 'show_cart', label: 'Show cart link', default: true },
    ],
    blocks,
    presets: [
      {
        name: 'Theme header',
        blocks: pageLinks.slice(0, 8).map(() => ({ type: 'link' })),
      },
    ],
  };

  return `<header class="shopify-section border-b border-gray-200 bg-white/95 backdrop-blur">
  <div class="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
    <a href="{{ routes.root_url }}" class="text-xl font-semibold tracking-tight text-gray-900">
      {{ section.settings.brand_name | default: shop.name }}
    </a>
    <nav class="hidden items-center gap-6 md:flex" aria-label="Primary">
      {% for block in section.blocks %}
        {% assign link_label = block.settings.label | default: block.type | capitalize %}
        {% assign link_url = block.settings.url | default: routes.root_url %}
        <a
          href="{{ link_url }}"
          class="text-sm font-medium text-gray-700 transition hover:text-gray-900"
          {{ block.shopify_attributes }}
        >
          {{ link_label }}
        </a>
      {% endfor %}
    </nav>
    {% if section.settings.show_cart %}
      <a href="{{ routes.cart_url }}" class="inline-flex items-center gap-2 text-sm font-medium text-gray-700 transition hover:text-gray-900">
        <span>Cart</span>
        <span class="rounded-full bg-gray-900 px-2 py-0.5 text-xs text-white">{{ cart.item_count }}</span>
      </a>
    {% endif %}
  </div>
</header>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function footerSection(pageLinks: Array<{ title: string; url: string }>): string {
  const blocks = pageLinks.slice(0, 8).map((link) => ({
    type: 'link',
    name: link.title.slice(0, 30),
    settings: [
      { type: 'text', id: 'label', label: 'Label', default: link.title },
      { type: 'url', id: 'url', label: 'Link' },
    ],
  }));

  const schema = {
    name: 'Theme footer',
    class: 'shopify-section-footer',
    max_blocks: 8,
    settings: [
      { type: 'text', id: 'heading', label: 'Heading', default: 'Explore the store' },
      {
        type: 'textarea',
        id: 'body',
        label: 'Body',
        default: 'All generated pages are connected through this footer so the imported theme is navigable immediately.',
      },
    ],
    blocks,
    presets: [
      {
        name: 'Theme footer',
        blocks: pageLinks.slice(0, 8).map(() => ({ type: 'link' })),
      },
    ],
  };

  return `<footer class="shopify-section border-t border-gray-200 bg-gray-950 text-white">
  <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr,0.8fr] lg:px-8">
    <div class="space-y-4">
      <h2 class="text-2xl font-semibold">{{ section.settings.heading }}</h2>
      <p class="max-w-xl text-sm leading-7 text-gray-300">{{ section.settings.body }}</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      {% for block in section.blocks %}
        {% assign link_label = block.settings.label | default: block.type | capitalize %}
        {% assign link_url = block.settings.url | default: routes.root_url %}
        <a
          href="{{ link_url }}"
          class="text-sm text-gray-200 transition hover:text-white"
          {{ block.shopify_attributes }}
        >
          {{ link_label }}
        </a>
      {% endfor %}
    </div>
  </div>
</footer>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function placeholderSection(): string {
  const body = `<section class="shopify-section" style="padding:4rem 1.5rem;text-align:center;font-family:system-ui,sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="font-size:1.75rem;font-weight:700;margin-bottom:.75rem">{{ section.settings.heading }}</h1>
    <p style="color:#6b7280">{{ section.settings.body }}</p>
  </div>
</section>`;
  const schema = {
    name: 'Placeholder',
    settings: [
      { type: 'text', id: 'heading', label: 'Heading', default: 'Coming soon' },
      {
        type: 'textarea',
        id: 'body',
        label: 'Body',
        default: 'This page has not been designed yet. Customize it in the theme editor.',
      },
    ],
    presets: [{ name: 'Placeholder' }],
  };
  return `${body}\n\n{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
}

function settingsSchema(projectName: string, css: string): string {
  const brand = pickColor(css, 'brand', '#111827');
  const accent = pickColor(css, 'accent', '#ff6747');
  const schema = [
    {
      name: 'theme_info',
      theme_name: `${projectName} (AI Shopify Theme Builder)`.slice(0, 60),
      theme_version: SHOPIFY_THEME_VERSION,
      theme_author: 'AI Shopify Theme Builder',
      theme_documentation_url: '',
      theme_support_url: '',
    },
    {
      name: 'Colors',
      settings: [
        { type: 'color', id: 'brand_color', label: 'Brand', default: brand },
        { type: 'color', id: 'accent_color', label: 'Accent', default: accent },
      ],
    },
    {
      name: 'Typography',
      settings: [
        {
          type: 'select',
          id: 'heading_font_stack',
          label: 'Headings',
          default: 'system',
          options: [
            { value: 'system', label: 'System' },
            { value: 'serif', label: 'Serif' },
          ],
        },
      ],
    },
  ];
  return JSON.stringify(schema, null, 2);
}

function settingsData(css: string): string {
  const brand = pickColor(css, 'brand', '#111827');
  const accent = pickColor(css, 'accent', '#ff6747');
  const values = { brand_color: brand, accent_color: accent, heading_font_stack: 'system' };
  return JSON.stringify({ current: values, presets: { Default: values } }, null, 2);
}

function defaultLocale(): string {
  return JSON.stringify(
    {
      general: {
        meta: { tags: 'Tagged "{{ tags }}"', page: 'Page {{ page }}' },
        search: { title: 'Search', placeholder: 'Search', submit: 'Search' },
      },
      products: {
        product: { add_to_cart: 'Add to cart', sold_out: 'Sold out', in_stock: 'In stock' },
      },
      cart: { general: { title: 'Your cart', checkout: 'Checkout', empty: 'Your cart is empty' } },
    },
    null,
    2
  );
}

function mainProductSection(): string {
  const schema = {
    name: 'Main product',
    settings: [
      { type: 'checkbox', id: 'show_vendor', label: 'Show vendor', default: true },
      { type: 'checkbox', id: 'show_description', label: 'Show description', default: true },
    ],
  };

  return `<section class="shopify-section bg-white px-4 py-12 sm:px-6 lg:px-8">
  <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr,0.9fr]">
    <div class="overflow-hidden rounded-[2rem] bg-gray-100">
      {% if product.featured_image %}
        {{
          product.featured_image
          | image_url: width: 1600
          | image_tag:
            widths: '480, 720, 960, 1200, 1600',
            sizes: '(min-width: 1024px) 55vw, 100vw',
            alt: product.featured_image.alt | default: product.title,
            class: 'h-full w-full object-cover'
        }}
      {% else %}
        <div class="flex min-h-[26rem] items-center justify-center">
          {{ 'product-1' | placeholder_svg_tag: 'h-24 w-24 opacity-50' }}
        </div>
      {% endif %}
    </div>
    <div class="flex flex-col justify-center gap-5">
      {% if section.settings.show_vendor and product.vendor != blank %}
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{{ product.vendor }}</p>
      {% endif %}
      <div class="space-y-3">
        <h1 class="text-4xl font-semibold tracking-tight text-gray-900">{{ product.title }}</h1>
        {% render 'price', amount: product.price %}
      </div>
      {% if section.settings.show_description and product.description != blank %}
        <div class="prose max-w-none text-gray-600">{{ product.description }}</div>
      {% endif %}
      {% form 'product', product, class: 'space-y-4' %}
        {% if product.has_only_default_variant == false %}
          <label class="block text-sm font-medium text-gray-700" for="ProductSelect-{{ section.id }}">Variant</label>
          <select
            id="ProductSelect-{{ section.id }}"
            name="id"
            class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
          >
            {% for variant in product.variants %}
              <option value="{{ variant.id }}" {% if variant == product.selected_or_first_available_variant %}selected{% endif %}>
                {{ variant.title }} - {{ variant.price | money }}
              </option>
            {% endfor %}
          </select>
        {% else %}
          <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
        {% endif %}
        <button
          type="submit"
          class="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          {% unless product.available %}disabled{% endunless %}
        >
          {% if product.available %}
            {{ 'products.product.add_to_cart' | t }}
          {% else %}
            {{ 'products.product.sold_out' | t }}
          {% endif %}
        </button>
      {% endform %}
    </div>
  </div>
</section>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function mainCollectionSection(): string {
  const schema = {
    name: 'Main collection',
    settings: [
      { type: 'range', id: 'products_per_page', min: 4, max: 24, step: 4, label: 'Products per page', default: 12 },
      { type: 'checkbox', id: 'show_description', label: 'Show description', default: true },
    ],
  };

  return `<section class="shopify-section bg-[#fcfcfb] px-4 py-12 sm:px-6 lg:px-8">
  <div class="mx-auto max-w-6xl space-y-8">
    <div class="space-y-4">
      <p class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Collection</p>
      <h1 class="text-4xl font-semibold tracking-tight text-gray-900">{{ collection.title }}</h1>
      {% if section.settings.show_description and collection.description != blank %}
        <div class="prose max-w-3xl text-gray-600">{{ collection.description }}</div>
      {% endif %}
    </div>
    {% paginate collection.products by section.settings.products_per_page %}
      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {% for product in collection.products %}
          {% render 'card-product', product: product %}
        {% else %}
          <div class="rounded-3xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
            No products found in this collection.
          </div>
        {% endfor %}
      </div>
      {% if paginate.pages > 1 %}
        <nav class="flex items-center justify-center gap-3 pt-4" aria-label="Pagination">
          {% if paginate.previous %}
            <a class="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700" href="{{ paginate.previous.url }}">Previous</a>
          {% endif %}
          <span class="text-sm text-gray-500">Page {{ paginate.current_page }} of {{ paginate.pages }}</span>
          {% if paginate.next %}
            <a class="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700" href="{{ paginate.next.url }}">Next</a>
          {% endif %}
        </nav>
      {% endif %}
    {% endpaginate %}
  </div>
</section>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function mainCollectionsListSection(): string {
  const schema = {
    name: 'Main collection list',
    settings: [{ type: 'range', id: 'collections_per_row', min: 2, max: 4, step: 1, label: 'Collections per row', default: 3 }],
  };

  return `<section class="shopify-section bg-white px-4 py-12 sm:px-6 lg:px-8">
  <div class="mx-auto max-w-6xl space-y-8">
    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Catalog</p>
      <h1 class="text-4xl font-semibold tracking-tight text-gray-900">{{ page_title | default: 'Collections' }}</h1>
    </div>
    {% liquid
      assign grid_class = 'md:grid-cols-3'
      if section.settings.collections_per_row == 2
        assign grid_class = 'md:grid-cols-2'
      elsif section.settings.collections_per_row == 4
        assign grid_class = 'md:grid-cols-2 xl:grid-cols-4'
      endif
    %}
    <div class="grid gap-6 {{ grid_class }}">
      {% for collection in collections %}
        {% render 'card-collection', collection: collection %}
      {% else %}
        <div class="rounded-3xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
          No collections available yet.
        </div>
      {% endfor %}
    </div>
  </div>
</section>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function mainCartSection(): string {
  const schema = {
    name: 'Main cart',
    settings: [{ type: 'checkbox', id: 'show_notes', label: 'Show order notes', default: true }],
  };

  return `<section class="shopify-section bg-[#fcfcfb] px-4 py-12 sm:px-6 lg:px-8">
  <div class="mx-auto max-w-5xl space-y-8">
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Checkout</p>
      <h1 class="text-4xl font-semibold tracking-tight text-gray-900">{{ 'cart.general.title' | t }}</h1>
    </div>
    {% if cart.item_count == 0 %}
      <div class="rounded-3xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
        {{ 'cart.general.empty' | t }}
      </div>
    {% else %}
      {% form 'cart', cart %}
        <div class="overflow-hidden rounded-[2rem] border border-gray-200 bg-white">
          <div class="divide-y divide-gray-200">
            {% for item in cart.items %}
              <div class="grid gap-4 px-5 py-5 md:grid-cols-[6rem,1fr,auto] md:items-center">
                <div class="overflow-hidden rounded-2xl bg-gray-100">
                  {% if item.image %}
                    {{ item.image | image_url: width: 240 | image_tag: loading: 'lazy', class: 'h-24 w-24 object-cover', alt: item.product.title }}
                  {% else %}
                    <div class="flex h-24 w-24 items-center justify-center">{{ 'product-1' | placeholder_svg_tag: 'h-10 w-10 opacity-50' }}</div>
                  {% endif %}
                </div>
                <div class="space-y-1">
                  <a href="{{ item.url }}" class="text-lg font-semibold text-gray-900">{{ item.product.title }}</a>
                  <p class="text-sm text-gray-500">{{ item.variant.title }}</p>
                  {% render 'price', amount: item.final_line_price %}
                </div>
                <label class="flex items-center gap-2 text-sm text-gray-600">
                  Qty
                  <input
                    class="w-20 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    type="number"
                    name="updates[]"
                    min="0"
                    value="{{ item.quantity }}"
                  >
                </label>
              </div>
            {% endfor %}
          </div>
        </div>
        {% if section.settings.show_notes %}
          <label class="block space-y-2 text-sm font-medium text-gray-700">
            Order notes
            <textarea class="min-h-28 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900" name="note">{{ cart.note }}</textarea>
          </label>
        {% endif %}
        <div class="flex flex-col items-start gap-4 rounded-[2rem] border border-gray-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm text-gray-500">Estimated total</p>
            <p class="text-2xl font-semibold text-gray-900">{{ cart.total_price | money }}</p>
          </div>
          <button type="submit" name="checkout" class="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800">
            {{ 'cart.general.checkout' | t }}
          </button>
        </div>
      {% endform %}
    {% endif %}
  </div>
</section>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function mainPageSection(pageTitle: string): string {
  const schema = {
    name: `${pageTitle.slice(0, 20) || 'Page'} content`,
    settings: [{ type: 'checkbox', id: 'show_title', label: 'Show page title', default: true }],
  };

  return `<section class="shopify-section bg-white px-4 py-12 sm:px-6 lg:px-8">
  <div class="mx-auto max-w-4xl space-y-6">
    {% if section.settings.show_title %}
      <h1 class="text-4xl font-semibold tracking-tight text-gray-900">{{ page.title }}</h1>
    {% endif %}
    <div class="prose max-w-none text-gray-700">
      {{ page.content }}
    </div>
  </div>
</section>

{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
}

function mainSectionDefinition(page: ThemeExportInput['pages'][number]): ThemeFile | null {
  const base = templateBaseName(page);
  switch (page.type) {
    case 'product':
      return text('sections/main-product.liquid', mainProductSection());
    case 'collection':
      return text('sections/main-collection.liquid', mainCollectionSection());
    case 'cart':
      return text('sections/main-cart.liquid', mainCartSection());
    case 'custom':
    case 'checkout':
      return text(`sections/main-${slugify(base, 'page')}.liquid`, mainPageSection(page.label));
    default:
      return null;
  }
}

function mainTemplateReference(page: ThemeExportInput['pages'][number]): TemplateSectionReference | null {
  const base = templateBaseName(page);
  switch (page.type) {
    case 'product':
      return { instanceId: 'main', type: 'main-product' };
    case 'collection':
      return { instanceId: 'main', type: 'main-collection' };
    case 'cart':
      return { instanceId: 'main', type: 'main-cart' };
    case 'custom':
    case 'checkout':
      return { instanceId: 'main', type: `main-${slugify(base, 'page')}` };
    default:
      return null;
  }
}

/**
 * Build the full theme file set. Deterministic and side-effect-free so it can be
 * validated, zipped, and re-run without touching state.
 */
/** Page types whose designed content becomes AI/raw body sections (not dynamic). */
function isDesignedPage(type: ThemeExportInput['pages'][number]['type']): boolean {
  return type === 'home' || type === 'custom' || type === 'checkout';
}

export function buildThemeFiles(input: ThemeExportInput, converted?: ConvertedContent): ThemeBuild {
  const files: ThemeFile[] = [];
  const imageUrls = new Set<string>();
  const usedBaseNames = new Set<string>();
  const addedFiles = new Set<string>();

  const pushFile = (file: ThemeFile) => {
    if (addedFiles.has(file.path)) return;
    addedFiles.add(file.path);
    files.push(file);
  };
  const pageLinks = input.pages.map((page) => ({
    title: page.label || page.key,
    url: normalizedPagePath(page.path, page.type),
  }));

  // --- Assets: vendored Tailwind + the project's global stylesheet ---
  pushFile(text('assets/tailwind.css', input.tailwindCss));
  pushFile(
    text(
      'assets/theme.css',
      `/* Project global theme — generated by AI Shopify Theme Builder */\n${input.themeCss || ''}\n`
    )
  );

  // --- Layout + snippets ---
  pushFile(text('layout/theme.liquid', layoutTheme(input.projectName)));
  pushFile(text('snippets/meta-tags.liquid', metaSnippet()));
  pushFile(text('snippets/price.liquid', priceSnippet()));
  pushFile(text('snippets/card-product.liquid', productCardSnippet()));
  pushFile(text('snippets/card-collection.liquid', collectionCardSnippet()));

  // --- Shared header/footer, reused by every template ---
  // Prefer the AI-converted designed header/footer (so the store's real design
  // shows on every page); fall back to the deterministic block-based ones.
  let headerRef: TemplateSectionReference;
  if (converted?.header) {
    pushFile(text(converted.header.fileName, converted.header.liquid));
    headerRef = { instanceId: 'header', type: converted.header.type };
  } else {
    pushFile(text('sections/theme-header.liquid', headerSection(pageLinks)));
    headerRef = { instanceId: 'theme_header', type: 'theme-header' };
  }
  let footerRef: TemplateSectionReference;
  if (converted?.footer) {
    pushFile(text(converted.footer.fileName, converted.footer.liquid));
    footerRef = { instanceId: 'footer', type: converted.footer.type };
  } else {
    pushFile(text('sections/theme-footer.liquid', footerSection(pageLinks)));
    footerRef = { instanceId: 'theme_footer', type: 'theme-footer' };
  }

  // --- Config ---
  pushFile(text('config/settings_schema.json', settingsSchema(input.projectName, input.themeCss)));
  pushFile(text('config/settings_data.json', settingsData(input.themeCss)));

  // --- Locales ---
  pushFile(text('locales/en.default.json', defaultLocale()));
  pushFile(text('sections/main-list-collections.liquid', mainCollectionsListSection()));

  // --- User pages → sections + templates ---
  for (const page of input.pages) {
    if (!page.html || !page.html.trim()) continue;

    for (const url of extractImageUrls(page.html)) imageUrls.add(url);

    // Resolve a unique template base name (custom pages could collide).
    let base = templateBaseName(page);
    if (usedBaseNames.has(base)) {
      let n = 2;
      while (usedBaseNames.has(`${base}-${n}`)) n += 1;
      base = `${base}-${n}`;
    }
    usedBaseNames.add(base);

    const references: TemplateSectionReference[] = [headerRef];

    if (isDesignedPage(page.type)) {
      // Designed pages (home, custom, checkout) render their AI-converted body
      // sections. If conversion produced nothing for this page, fall back to the
      // deterministic full-page split so the page is never empty.
      const aiBody = converted?.bodies[page.key];
      const body = aiBody && aiBody.length > 0 ? aiBody : convertPageToSections(page);
      for (const section of body) {
        pushFile(text(section.fileName, section.liquid));
      }
      references.push(...body.map((section) => ({ instanceId: section.instanceId, type: section.type })));
    } else {
      // Product / collection / cart use the real dynamic Shopify sections.
      const mainReference = mainTemplateReference(page);
      const mainSection = mainSectionDefinition(page);
      if (mainSection && mainReference) {
        pushFile(mainSection);
        references.push(mainReference);
      }
    }

    references.push(footerRef);

    pushFile(text(`templates/${base}.json`, buildTemplateJsonFromReferences(references)));
  }

  // --- Placeholder section used by every gap-filling template ---
  pushFile(text('sections/placeholder.liquid', placeholderSection()));

  // --- Fill required standard templates the user didn't design ---
  for (const base of REQUIRED_TEMPLATES) {
    if (usedBaseNames.has(base)) continue;
    usedBaseNames.add(base);
    if (base === 'list-collections') {
      pushFile(
        text(
          'templates/list-collections.json',
          buildTemplateJsonFromReferences([
            headerRef,
            { instanceId: 'main', type: 'main-list-collections' },
            footerRef,
          ])
        )
      );
      continue;
    }
    pushFile(
      text(
        `templates/${base}.json`,
        buildTemplateJsonFromReferences([headerRef, { instanceId: 'main', type: 'placeholder' }, footerRef])
      )
    );
  }

  // --- Customer-account templates (templates/customers/*) ---
  for (const name of CUSTOMER_TEMPLATES) {
    pushFile(
      text(
        `templates/customers/${name}.json`,
        buildTemplateJsonFromReferences([headerRef, { instanceId: 'main', type: 'placeholder' }, footerRef])
      )
    );
  }

  // Sections must exist for the schema block referenced above; placeholder added.

  return { files, imageUrls: Array.from(imageUrls) };
}
