'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import Tag from '@/components/Tag';
import Alert from '@/components/Alert';

export default function DesignSystemPage() {
  const [tags, setTags] = useState(['Landing', 'New', 'Premium']);
  const [alerts, setAlerts] = useState<string[]>(['success', 'warning', 'error', 'info']);

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary-600 rounded-base flex items-center justify-center text-white text-xl font-bold">
              ⬡
            </div>
            <div>
              <h1 className="text-h1 text-neutral-900">Shopify Theme Builder</h1>
              <p className="text-body-lg text-neutral-500 mt-1">Design System</p>
            </div>
          </div>
          <p className="text-body-lg text-neutral-600 max-w-2xl">
            A unified design language for building beautiful, consistent, and intuitive Shopify theme experiences.
          </p>
        </div>

        {/* Design Principles */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Design Principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '👁️', title: 'Clarity', desc: 'Clear hierarchy and visual simplicity.' },
              { icon: '🎯', title: 'Consistency', desc: 'Unified components and styles.' },
              { icon: '🔄', title: 'Flexibility', desc: 'Composable and theme-friendly.' },
              { icon: '♿', title: 'Accessibility', desc: 'Built with inclusivity in mind.' },
            ].map((principle) => (
              <Card key={principle.title} shadow="sm" padding="md">
                <div className="text-3xl mb-3">{principle.icon}</div>
                <h3 className="text-h4 text-neutral-900 mb-2">{principle.title}</h3>
                <p className="text-body-sm text-neutral-600">{principle.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Colors */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Colors</h2>

          <div className="mb-8">
            <h3 className="text-h4 mb-4 text-neutral-900">Primary</h3>
            <div className="flex gap-4 flex-wrap">
              {[
                { name: '600', color: '#FF5840' },
                { name: '500', color: '#FF8966' },
                { name: '300', color: '#FFB3A1' },
                { name: '200', color: '#FFC9B8' },
                { name: '100', color: '#FFE5DE' },
              ].map((c) => (
                <div key={c.name} className="text-center">
                  <div className="w-16 h-16 rounded-base shadow-sm mb-2" style={{ backgroundColor: c.color }} />
                  <p className="text-xs text-neutral-600 font-mono">{c.name}</p>
                  <p className="text-xs text-neutral-500 font-mono">{c.color}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-h4 mb-4 text-neutral-900">Neutrals</h3>
            <div className="flex gap-4 flex-wrap">
              {[
                { name: '900', color: '#0F1724' },
                { name: '700', color: '#2C3E54' },
                { name: '500', color: '#6B7C96' },
                { name: '300', color: '#B0C4D9' },
                { name: '100', color: '#DCE5ED' },
                { name: '50', color: '#F4F9FF' },
              ].map((c) => (
                <div key={c.name} className="text-center">
                  <div className="w-16 h-16 rounded-base shadow-sm mb-2 border border-neutral-200" style={{ backgroundColor: c.color }} />
                  <p className="text-xs text-neutral-600 font-mono">{c.name}</p>
                  <p className="text-xs text-neutral-500 font-mono">{c.color}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-h4 mb-4 text-neutral-900">Semantic</h3>
            <div className="flex gap-4 flex-wrap">
              {[
                { name: 'Success', color: '#22CC58' },
                { name: 'Warning', color: '#F9B838' },
                { name: 'Error', color: '#EF4444' },
                { name: 'Info', color: '#2882F6' },
                { name: 'Purple', color: '#885CF8' },
              ].map((c) => (
                <div key={c.name} className="text-center">
                  <div className="w-16 h-16 rounded-base shadow-sm mb-2" style={{ backgroundColor: c.color }} />
                  <p className="text-xs text-neutral-600 font-mono">{c.name}</p>
                  <p className="text-xs text-neutral-500 font-mono">{c.color}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Typography</h2>
          <Card shadow="sm" padding="lg">
            <div className="space-y-6">
              <div>
                <div className="text-h1 text-neutral-900">H1 - Heading 1</div>
                <p className="text-xs text-neutral-500 mt-1">36px / 44px • Bold</p>
              </div>
              <div>
                <div className="text-h2 text-neutral-900">H2 - Heading 2</div>
                <p className="text-xs text-neutral-500 mt-1">28px / 36px • Semibold</p>
              </div>
              <div>
                <div className="text-h3 text-neutral-900">H3 - Heading 3</div>
                <p className="text-xs text-neutral-500 mt-1">22px / 28px • Semibold</p>
              </div>
              <div>
                <div className="text-h4 text-neutral-900">H4 - Heading 4</div>
                <p className="text-xs text-neutral-500 mt-1">18px / 24px • Medium</p>
              </div>
              <div>
                <div className="text-body-lg text-neutral-900">Body Large - 16px / 24px • Regular</div>
                <p className="text-xs text-neutral-500 mt-1">Use for main content and body text</p>
              </div>
              <div>
                <div className="text-body-base text-neutral-900">Body Base - 14px / 20px • Regular</div>
                <p className="text-xs text-neutral-500 mt-1">Default body text size</p>
              </div>
              <div>
                <div className="text-body-sm text-neutral-900">Body Small - 12px / 16px • Regular</div>
                <p className="text-xs text-neutral-500 mt-1">Use for helper text and captions</p>
              </div>
            </div>
          </Card>
        </section>

        {/* Buttons */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Buttons</h2>

          <div className="mb-8">
            <h3 className="text-h4 mb-4 text-neutral-900">Primary</h3>
            <div className="flex gap-4 flex-wrap items-center">
              <Button variant="primary" size="lg">Default</Button>
              <Button variant="primary" size="lg" disabled>Disabled</Button>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-h4 mb-4 text-neutral-900">Secondary</h3>
            <div className="flex gap-4 flex-wrap items-center">
              <Button variant="secondary" size="lg">Default</Button>
              <Button variant="secondary" size="lg" disabled>Disabled</Button>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-h4 mb-4 text-neutral-900">Ghost</h3>
            <div className="flex gap-4 flex-wrap items-center">
              <Button variant="ghost" size="lg">Default</Button>
              <Button variant="ghost" size="lg" disabled>Disabled</Button>
            </div>
          </div>

          <div>
            <h3 className="text-h4 mb-4 text-neutral-900">Icon Button</h3>
            <div className="flex gap-4 flex-wrap items-center">
              <Button variant="icon" size="md">+</Button>
              <Button variant="icon" size="md">→</Button>
              <Button variant="icon" size="md" disabled>✕</Button>
            </div>
          </div>
        </section>

        {/* Form Components */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Form Components</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-h4 mb-4 text-neutral-900">Input Field</h3>
              <Input
                label="Label"
                placeholder="Enter page name"
                helperText="Helper text goes here"
              />
            </div>

            <div>
              <h3 className="text-h4 mb-4 text-neutral-900">Select</h3>
              <Select
                label="Choose a template"
                options={[
                  { value: 'landing', label: 'Landing page' },
                  { value: 'product', label: 'Product page' },
                  { value: 'collection', label: 'Collection page' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Tags */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Tags</h2>
          <Card shadow="sm" padding="lg">
            <div className="flex gap-3 flex-wrap">
              {tags.map((tag, i) => (
                <Tag
                  key={tag}
                  variant={i === 0 ? 'default' : i === 1 ? 'success' : 'purple'}
                  onRemove={() => setTags(tags.filter((_, idx) => idx !== i))}
                >
                  {tag}
                </Tag>
              ))}
            </div>
          </Card>
        </section>

        {/* Alerts */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Alerts</h2>
          <div className="space-y-4">
            {['success', 'warning', 'error', 'info'].map((variant) => (
              alerts.includes(variant) && (
                <Alert
                  key={variant}
                  variant={variant as 'success' | 'warning' | 'error' | 'info'}
                  title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} Alert`}
                  onDismiss={() => setAlerts(alerts.filter((a) => a !== variant))}
                >
                  This is a {variant} alert message. It provides feedback to the user.
                </Alert>
              )
            ))}
          </div>
        </section>

        {/* Spacing & Shadows */}
        <section className="mb-16">
          <h2 className="text-h2 mb-6 text-neutral-900">Spacing & Shadows</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-h4 mb-4 text-neutral-900">Spacing Scale</h3>
              <Card shadow="sm" padding="lg">
                <div className="space-y-3 text-sm text-neutral-600">
                  <p>xs: 0.25rem (4px)</p>
                  <p>sm: 0.5rem (8px)</p>
                  <p>md: 0.75rem (12px)</p>
                  <p>base: 1rem (16px)</p>
                  <p>lg: 1.5rem (24px)</p>
                  <p>xl: 2rem (32px)</p>
                  <p>2xl: 3rem (48px)</p>
                  <p>3xl: 4rem (64px)</p>
                  <p>4xl: 6rem (96px)</p>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-h4 mb-4 text-neutral-900">Shadow Levels</h3>
              <div className="space-y-3">
                {['xs', 'sm', 'md', 'lg', 'xl'].map((level) => (
                  <div
                    key={level}
                    className={`p-4 bg-white rounded-base shadow-${level} text-sm text-neutral-600`}
                  >
                    shadow-{level}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
