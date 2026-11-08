import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchBox } from './SearchBox.js';

describe('SearchBox', () => {
  it('opts out of the browser identity autofill (#168)', () => {
    render(<SearchBox query="" onChange={() => undefined} />);

    const field = screen.getByRole('searchbox', { name: 'Search titles and people' });

    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('name', 'q');
  });
});
