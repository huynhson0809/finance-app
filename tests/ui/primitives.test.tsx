import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../src/i18n';
import {
  CategoryIconTile,
  DarkField,
  GlassPanel,
  KeypadButton,
  MetricCard,
  MoneyRow,
  SegmentedControl,
} from '../../src/ui/components/primitives';

beforeAll(async () => { await initI18n(); });

describe('dark UI primitives', () => {
  it('renders glass panels and metric cards with accessible labels', () => {
    render(
      <GlassPanel aria-label="Monthly overview">
        <MetricCard label="Total spend" value="297,000đ" tone="expense" />
      </GlassPanel>,
    );

    expect(screen.getByLabelText('Monthly overview')).toBeInTheDocument();
    expect(screen.getByText('Total spend')).toBeInTheDocument();
    expect(screen.getByText('297,000đ')).toBeInTheDocument();
  });

  it('renders selectable category tiles with pressed state', () => {
    render(
      <CategoryIconTile
        category="food-drinks"
        label="Food"
        selected
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('notifies segmented control changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Direction"
        value="expense"
        onChange={onChange}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Income' }));

    expect(onChange).toHaveBeenCalledWith('income');
  });

  it('keeps keypad and fields accessible', async () => {
    const user = userEvent.setup();
    const onKey = vi.fn();
    render(
      <>
        <DarkField label="Merchant">
          <input />
        </DarkField>
        <KeypadButton label="4" onPress={onKey}>4</KeypadButton>
      </>,
    );

    await user.click(screen.getByRole('button', { name: '4' }));

    expect(screen.getByText('Merchant')).toBeInTheDocument();
    expect(screen.getByLabelText('Merchant')).toBeInstanceOf(HTMLInputElement);
    expect(onKey).toHaveBeenCalledWith('4');
  });

  it('renders money rows with signed amounts', () => {
    render(
      <MoneyRow
        icon={<span aria-hidden="true">icon</span>}
        title="Lunch"
        subtitle="Food"
        amount="-35,000đ"
        tone="expense"
      />,
    );

    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('-35,000đ')).toBeInTheDocument();
  });
});
