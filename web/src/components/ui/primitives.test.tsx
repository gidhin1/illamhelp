// @vitest-environment jsdom
import React, { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button, NavigationButton, CheckboxInput, Field, SelectInput, TextArea, TextInput } from '@illamhelp/ui-web';

import { Dialog } from '@illamhelp/ui-web/dialog';

afterEach(cleanup);

describe('Illamhelp MUI adapter contracts', () => {
  it('keeps native value/change events, refs, labels, required and test IDs on the input', () => {
    const ref = createRef<HTMLInputElement>();
    function Form() {
      const [value, setValue] = useState('');
      return <Field label="Name" hint="Public name" error="Required"><TextInput ref={ref} value={value} onChange={e => setValue(e.target.value)} required data-testid="name" /></Field>;
    }
    render(<Form />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input).toBe(screen.getByTestId('name'));
    expect(ref.current).toBe(input);
    fireEvent.change(input, { target: { value: 'Maya' } });
    expect(input.value).toBe('Maya');
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    for (const id of input.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull();
  });
  it('keeps select options, native change target and select ref', () => {
    const ref = createRef<HTMLSelectElement>();
    const changed = vi.fn();
    render(<Field label="Visibility"><SelectInput ref={ref} defaultValue="public" onChange={e => changed(e.target.value)}><option value="public">Public</option><option value="private">Private</option></SelectInput></Field>);
    const input = screen.getByLabelText('Visibility');
    expect(ref.current).toBe(input);
    fireEvent.change(input, { target: { value: 'private' } });
    expect(changed).toHaveBeenCalledWith('private');
  });
  it('keeps multiline input, explicit IDs and raw file labels', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<><Field label="Message"><TextArea ref={ref} id="message" defaultValue="Hello" rows={4} /></Field><Field label="Evidence"><input type="file" /></Field></>);
    expect(screen.getByLabelText('Message')).toBe(ref.current);
    expect(ref.current?.value).toBe('Hello');
    expect((screen.getByLabelText('Evidence') as HTMLInputElement).type).toBe('file');
  });
  it('submits once and blocks additional clicks while loading', () => {
    const submitted = vi.fn();
    function Form() {
      const [loading, setLoading] = useState(false);
      return <form onSubmit={e => { e.preventDefault(); submitted(); setLoading(true); }}><Button type="submit" loading={loading}>Save</Button></form>;
    }
    render(<Form />);
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
  it('renders navigation as one anchor without a nested button', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(<NavigationButton ref={ref} href="/jobs">Jobs</NavigationButton>);
    const link = screen.getByRole('link', { name: 'Jobs' });
    expect(ref.current).toBe(link);
    expect(link.getAttribute('href')).toBe('/jobs');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('restores focus to the opener when a dialog closes with Escape', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return <><Button type="button" onClick={() => setOpen(true)}>Apply</Button><Dialog open={open} onClose={() => setOpen(false)} titleId="application-title"><h2 id="application-title">Application</h2><TextInput aria-label="Message" /></Dialog></>;
    }
    render(<Example />);
    const opener = screen.getByRole('button', { name: 'Apply' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Application' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
  it('keeps disabled selectors out of form submission and marks their presentation disabled', () => {
    render(<form aria-label="Preferences"><Field label="Status"><SelectInput name="status" disabled defaultValue="pending"><option value="pending">Pending</option></SelectInput></Field></form>);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.classList.contains('Mui-disabled')).toBe(true);
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).has('status')).toBe(false);
  });
  it('keeps checkbox semantics and events on the real input', () => {
    const changed = vi.fn();
    render(<label><CheckboxInput data-testid="agreement" onChange={e => changed(e.target.checked)} />Accept terms</label>);
    const input = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(input).toBe(screen.getByTestId('agreement'));
    fireEvent.click(input);
    expect(changed).toHaveBeenCalledWith(true);
  });
});
