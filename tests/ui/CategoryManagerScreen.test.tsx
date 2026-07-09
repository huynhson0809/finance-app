import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { MemoryRouter } from 'react-router-dom';
import { __resetDBForTests } from '../../src/db';
import { getCategoryOverrides } from '../../src/db/category-overrides';
import { createCustomCategory, getCustomCategories } from '../../src/db/custom-categories';
import { initI18n, setLocale } from '../../src/i18n';
import { CategoryManagerScreen } from '../../src/ui/CategoryManagerScreen';

beforeAll(async () => { await initI18n(); });

beforeEach(async () => {
  await setLocale('en');
  await __resetDBForTests();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('finance-app');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

function renderManager(path = '/categories?direction=expense') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CategoryManagerScreen />
    </MemoryRouter>,
  );
}

describe('CategoryManagerScreen', () => {
  it('shows the Money Note-style category list with an add row', async () => {
    renderManager();

    expect(await screen.findByRole('heading', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument();
    expect(screen.getByText('Food & Drinks')).toBeInTheDocument();
  });

  it('creates a custom category with the selected icon', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Add category' }));
    await user.type(screen.getByLabelText('Category name'), 'Snacks');
    await user.click(screen.getByRole('button', { name: /shopping icon/i }));
    await user.click(screen.getByRole('button', { name: 'Save category' }));

    expect(await screen.findByText('Snacks')).toBeInTheDocument();
    await waitFor(async () => {
      const categories = await getCustomCategories();
      expect(categories).toEqual([
        expect.objectContaining({
          direction: 'expense',
          name: 'Snacks',
          iconKey: 'shopping',
        }),
      ]);
    });
  });

  it('edits a built-in category display name and icon from the inline editor', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Food & Drinks' }));
    expect(screen.getByTestId('category-editor')).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Category name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Eating out');
    await user.click(screen.getByRole('button', { name: /coffee icon/i }));
    await user.click(screen.getByRole('button', { name: 'Save category' }));

    expect(await screen.findByRole('button', { name: 'Eating out' })).toBeInTheDocument();
    await waitFor(async () => {
      expect(await getCategoryOverrides()).toEqual([
        expect.objectContaining({
          category: 'food-drinks',
          name: 'Eating out',
          iconKey: 'coffee',
        }),
      ]);
    });
  });

  it('renames, changes icon, and deletes an existing custom category', async () => {
    const category = await createCustomCategory('expense', 'Snacks', 'shopping');
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Snacks' }));
    const nameInput = screen.getByLabelText('Category name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Treats');
    await user.click(screen.getByRole('button', { name: /bills icon/i }));
    await user.click(screen.getByRole('button', { name: 'Save category' }));

    expect(await screen.findByText('Treats')).toBeInTheDocument();
    await waitFor(async () => {
      const categories = await getCustomCategories();
      expect(categories).toEqual([
        expect.objectContaining({
          id: category.id,
          name: 'Treats',
          iconKey: 'bills',
        }),
      ]);
    });

    await user.click(screen.getByRole('button', { name: 'Treats' }));
    await user.click(screen.getByRole('button', { name: 'Delete category' }));

    await waitFor(async () => {
      expect(await getCustomCategories()).toEqual([]);
    });
  });
});
