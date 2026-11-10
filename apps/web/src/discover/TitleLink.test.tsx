import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TitleLink as Link } from '@popcorntv/shared';
import { TitleLink } from './TitleLink.js';
import type { TitleLinkApi } from './TitleLink.js';

const URL = 'https://example.org/watch';

function fakeApi(answer: Link, saved = true) {
  return {
    load: vi.fn(async () => answer),
    save: vi.fn(async () => saved),
  } satisfies TitleLinkApi;
}

describe('TitleLink', () => {
  it('should open the stored link in a new tab, without edit control for a viewer', async () => {
    const api = fakeApi({ url: URL, editable: false });

    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    const link = await screen.findByRole('link', { name: 'Open my link' });
    expect(link).toHaveAttribute('href', URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Edit link' })).not.toBeInTheDocument();
    expect(api.load).toHaveBeenCalledWith('movie', 603);
  });

  it('should render nothing for a viewer when there is no link', async () => {
    const api = fakeApi({ url: null, editable: false });

    const { container } = render(<TitleLink kind="tv" tmdbId={1} api={api} />);

    await waitFor(() => expect(api.load).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('should render nothing when the load fails', async () => {
    const api = { load: vi.fn(async () => Promise.reject(new Error('down'))), save: vi.fn() };

    const { container } = render(<TitleLink kind="tv" tmdbId={1} api={api} />);

    await waitFor(() => expect(api.load).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('should let an owner add a link, then show it', async () => {
    const api = fakeApi({ url: null, editable: true });
    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: '+ Add my link' }));
    await userEvent.type(screen.getByLabelText('My link'), ' https://Example.org/watch ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.save).toHaveBeenCalledWith('movie', 603, URL);
    expect(await screen.findByRole('link', { name: 'Open my link' })).toHaveAttribute('href', URL);
    expect(screen.getByRole('button', { name: 'Edit link' })).toBeInTheDocument();
  });

  it('should refuse a non-http link before calling the server', async () => {
    const api = fakeApi({ url: null, editable: true });
    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: '+ Add my link' }));
    await userEvent.type(screen.getByLabelText('My link'), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an http(s) link.');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('should keep the form open with the error when the server refuses', async () => {
    const api = fakeApi({ url: null, editable: true }, false);
    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: '+ Add my link' }));
    await userEvent.type(screen.getByLabelText('My link'), URL);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open my link' })).not.toBeInTheDocument();
  });

  it('should remove a link', async () => {
    const api = fakeApi({ url: URL, editable: true });
    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit link' }));
    expect(screen.getByLabelText('My link')).toHaveValue(URL);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(api.save).toHaveBeenCalledWith('movie', 603, null);
    expect(await screen.findByRole('button', { name: '+ Add my link' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open my link' })).not.toBeInTheDocument();
  });

  it('should close the form on Cancel without saving', async () => {
    const api = fakeApi({ url: URL, editable: true });
    render(<TitleLink kind="movie" tmdbId={603} api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('My link')).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });
});
