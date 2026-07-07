import { render, screen } from '@testing-library/react';
import { CategoryPie } from '../../src/ui/components/Charts/CategoryPie';
import { MonthBar } from '../../src/ui/components/Charts/MonthBar';
import { initI18n } from '../../src/i18n';

beforeAll(async () => { await initI18n(); });

it('shows empty state when all totals are 0', () => {
  render(<CategoryPie data={[
    { category: 'food-drinks', total: 0, label: 'Food', color: '#888' },
  ]} />);
  expect(screen.getByText(/no spending|chưa có chi tiêu/i)).toBeInTheDocument();
});

it('uses a custom empty label when provided', () => {
  render(<CategoryPie
    data={[{ category: 'salary', total: 0, label: 'Salary', color: '#22c55e' }]}
    emptyLabel="No income this month"
  />);

  expect(screen.getByText('No income this month')).toBeInTheDocument();
});

it('renders an svg when there is data', () => {
  const { container } = render(<CategoryPie data={[
    { category: 'food-drinks', total: 1000, label: 'Food', color: '#888' },
    { category: 'shopping',    total:  500, label: 'Shop', color: '#aaa' },
  ]} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
});

it('renders MonthBar svg with provided data', () => {
  const data = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    total: i * 100,
  }));
  const { container } = render(<MonthBar data={data} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
});
