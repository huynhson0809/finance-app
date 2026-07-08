import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Utensils } from 'lucide-react';
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

  it('lets metric values wrap instead of truncating exact amounts', () => {
    render(<MetricCard label="Net total" value="₫123,456,789,012" />);

    const value = screen.getByText('₫123,456,789,012');
    expect(value).not.toHaveClass('truncate');
    expect(value).toHaveClass('break-words');
  });

  it('renders selectable category tiles with pressed state', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CategoryIconTile
        value="food-drinks"
        label="Food"
        selected
        onSelect={onSelect}
        Icon={Utensils}
        accentClass="text-emerald-300"
        surfaceClass="bg-emerald-400/20"
      />,
    );

    const button = screen.getByRole('button', { name: 'Food' });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);

    expect(onSelect).toHaveBeenCalledWith('food-drinks');
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

    expect(screen.getByRole('button', { name: 'Expense' })).toHaveAttribute('aria-pressed', 'true');

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

    const input = screen.getByLabelText('Merchant');
    const label = screen.getByText('Merchant');
    expect(label.tagName).toBe('LABEL');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toHaveAttribute('id');
    expect(label).toHaveAttribute('for', input.id);
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
    expect(screen.getByText('Lunch').closest('li')).toBeNull();
  });
});
