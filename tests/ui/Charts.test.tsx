import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

it('renders the category donut with Recharts when there is data', () => {
  const { container } = render(<CategoryPie data={[
    { category: 'food-drinks', total: 1000, label: 'Food', color: '#888' },
    { category: 'shopping',    total:  500, label: 'Shop', color: '#aaa' },
  ]} />);
  expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
  expect(container.querySelector('svg')).toBeInTheDocument();
});

it('shows and updates the selected category callout with a small arrow', async () => {
  const user = userEvent.setup();

  render(<CategoryPie
    locale="en"
    data={[
      { category: 'food-drinks', total: 1000, label: 'Food', color: '#888' },
      { category: 'shopping',    total:  500, label: 'Shop', color: '#aaa' },
    ]}
  />);

  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('Food');
  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('₫1,000');
  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('67%');
  expect(screen.getByTestId('category-pie-tooltip-arrow')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /select shop/i }));

  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('Shop');
  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('₫500');
  expect(screen.getByTestId('category-pie-callout')).toHaveTextContent('33%');
  const callout = screen.getByTestId('category-pie-callout');
  expect(callout).toHaveClass('rounded-xl');
});

it('keeps the selected category callout outside the donut plot area', () => {
  render(<CategoryPie
    locale="en"
    data={[
      { category: 'food-drinks', total: 1000, label: 'Food', color: '#888' },
      { category: 'shopping',    total:  500, label: 'Shop', color: '#aaa' },
    ]}
  />);

  const plot = screen.getByTestId('category-pie-plot');
  const callout = screen.getByTestId('category-pie-callout');

  expect(plot).not.toContainElement(callout);
  expect(callout).toHaveAttribute('data-placement', 'above-chart');
});

it('renders MonthBar svg with provided data', () => {
  const data = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    total: i * 100,
  }));
  const { container } = render(<MonthBar data={data} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
});
