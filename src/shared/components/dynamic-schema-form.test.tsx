import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicSchemaForm } from './dynamic-schema-form';

const schema = {
  properties: {
    name: { type: 'string', default: 'demo' },
    replicas: { type: 'integer', default: 2 },
  },
};

describe('DynamicSchemaForm', () => {
  // Regression: an inline `initialValues = {}` default changed identity on
  // every render, re-running the rebuild effect in an endless loop.
  it('settles when initialValues is omitted (no re-render loop)', () => {
    const onParametersChange = vi.fn();
    const { rerender } = render(
      <DynamicSchemaForm schema={schema} onParametersChange={onParametersChange} />,
    );
    rerender(<DynamicSchemaForm schema={schema} onParametersChange={onParametersChange} />);

    expect(onParametersChange.mock.calls.length).toBeLessThanOrEqual(4);
    expect(onParametersChange).toHaveBeenLastCalledWith({ name: 'demo', replicas: 2 });
  });

  it('seeds values from initialValues over schema defaults', () => {
    const onParametersChange = vi.fn();
    render(
      <DynamicSchemaForm
        schema={schema}
        initialValues={{ name: 'custom' }}
        onParametersChange={onParametersChange}
      />,
    );

    expect(onParametersChange).toHaveBeenLastCalledWith({ name: 'custom', replicas: 2 });
  });

  // Regression: fields hidden by x-ui-condition were still validated (an
  // invisible error blocked submission) and their stale values were emitted.
  it('skips hidden conditional fields in validation and emission', () => {
    const onParametersChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <DynamicSchemaForm
        schema={{
          properties: {
            mode: { type: 'string', enum: ['on', 'off'], default: 'off' },
            extraMemory: {
              type: 'string',
              default: '',
              'x-ui-condition': { field: 'mode', value: 'on' },
            },
          },
        }}
        initialValues={{ extraMemory: 'not-a-quantity' }}
        onParametersChange={onParametersChange}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    expect(onParametersChange).toHaveBeenLastCalledWith({ mode: 'off' });
  });

  // Regression: an enum field matching the quantity heuristic ("rateLimitPolicy")
  // failed K8S_QUANTITY_RE on its enum values and invisibly invalidated the form.
  it('does not quantity-validate enum (select) fields', () => {
    const onValidityChange = vi.fn();
    render(
      <DynamicSchemaForm
        schema={{
          properties: {
            rateLimitPolicy: { type: 'string', enum: ['burst', 'steady'], default: 'burst' },
          },
        }}
        onParametersChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  // Regression: the error message only rendered for the plain-text widget, and
  // the camelCase haystack never matched \bmemory\b ("driverMemory").
  it('renders the quantity error for non-text widgets and camelCase names', () => {
    const onValidityChange = vi.fn();
    render(
      <DynamicSchemaForm
        schema={{
          properties: {
            driverMemory: { type: 'string', default: 'bogus', 'x-ui-widget': 'textarea' },
          },
        }}
        onParametersChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/Invalid Kubernetes quantity/)).toBeTruthy();
  });
});

// A row being typed is not yet a valid map entry: it may have no key, or a key
// that duplicates another until the typing is finished. Deriving the rows from
// the emitted object made two fresh rows share the empty key and collapse.
describe('the key-value widget', () => {
  const mapping = { properties: { roleMapping: { type: 'object', properties: {} } } };

  it('keeps two fresh rows apart', () => {
    render(<DynamicSchemaForm schema={mapping} onParametersChange={vi.fn()} />);

    const add = screen.getByRole('button', { name: /Add an entry/ });
    fireEvent.click(add);
    fireEvent.click(add);

    expect(screen.getAllByPlaceholderText('OIDC role')).toHaveLength(2);
  });

  it('emits only the rows that carry a key', () => {
    const onParametersChange = vi.fn();
    render(<DynamicSchemaForm schema={mapping} onParametersChange={onParametersChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add an entry/ }));
    fireEvent.change(screen.getAllByPlaceholderText('OIDC role')[0], {
      target: { value: 'data-team' },
    });
    fireEvent.change(screen.getAllByPlaceholderText(/granted roles/)[0], {
      target: { value: 'reader' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add an entry/ }));

    const last = onParametersChange.mock.calls.at(-1)![0];
    expect(last.roleMapping).toEqual({ 'data-team': 'reader' });
  });
});
