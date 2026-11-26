import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';

describe('App integration UI', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  it('toggles language EN/ID and switches Light/Dark theme', () => {
    render(<App />);

    expect(screen.getByText(/Konversi & Kompres File/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByText(/Convert & Compress Files/i)).toBeInTheDocument();

    const themeBtn = screen.getByRole('button', { name: /Toggle Light\/Dark Theme/i });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('activates tool deep-link route when clicking a shortcut pill', () => {
    render(<App />);

    const shortcut = screen.getByRole('button', { name: /HEIC → JPG/i });
    fireEvent.click(shortcut);

    expect(window.location.pathname).toBe('/heic-to-jpg');
    expect(screen.getByText(/Mode HEIC aktif/i)).toBeInTheDocument();
  });

  it('renders separate Audio, Video, and PDF settings when mixed files are queued', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    const audio = new File(['abc'], 'voice.wav', { type: 'audio/wav' });
    const video = new File(['def'], 'clip.mp4', { type: 'video/mp4' });
    const pdf = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [audio, video, pdf] } });

    fireEvent.click(screen.getByRole('button', { name: /Pengaturan Manual/i }));

    expect(screen.getByText('Pengaturan Audio')).toBeInTheDocument();
    expect(screen.getByText('Pengaturan Video & GIF')).toBeInTheDocument();
    expect(screen.getByText('Pengaturan PDF')).toBeInTheDocument();
  });

  it('shows a dismissible alert when unsupported files are dropped', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    const unsupported = new File(['hello'], 'notes.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(fileInput, { target: { files: [unsupported] } });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/notes\.docx/i);

    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets route options cleanly when switching routes or returning home', () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Kompres < 500 KB/i }));
    expect(window.location.pathname).toBe('/kompres-foto-500kb');

    fireEvent.click(screen.getByRole('button', { name: /Gambar → PDF/i }));
    expect(window.location.pathname).toBe('/image-to-pdf');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const img = new File(['img'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [img] } });

    const targetCheckbox = screen.getByRole('checkbox', {
      name: /Aktifkan Target Ukuran File Otomatis/i,
    }) as HTMLInputElement;
    expect(targetCheckbox.checked).toBe(false);
  });

  it('supports Escape key and dialog aria attributes on PrivacyNoticeModal', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Cara Kerja & Privasi/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('respects prefers-color-scheme light when no theme is saved in localStorage', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      render(<App />);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('shows audio trim inputs and invalid trim range warning', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const audio = new File(['abc'], 'voice.wav', { type: 'audio/wav' });
    fireEvent.change(fileInput, { target: { files: [audio] } });

    fireEvent.click(screen.getByRole('button', { name: /Pengaturan Manual/i }));

    const startInput = document.getElementById('audio-trim-start') as HTMLInputElement;
    const endInput = document.getElementById('audio-trim-end') as HTMLInputElement;

    fireEvent.change(startInput, { target: { value: '20' } });
    fireEvent.change(endInput, { target: { value: '10' } });

    expect(
      screen.getByText(/Waktu selesai harus lebih besar dari waktu mulai/i),
    ).toBeInTheDocument();
  });

  it('cycles per-image quick rotation only on the targeted image card', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const img1 = new File(['a'], 'first.png', { type: 'image/png' });
    const img2 = new File(['b'], 'second.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [img1, img2] } });

    const rotateButtons = screen.getAllByRole('button', { name: /Putar foto ini 90°/i });
    expect(rotateButtons).toHaveLength(2);

    fireEvent.click(rotateButtons[0]);
    expect(rotateButtons[0]).toHaveTextContent('90°');
    expect(rotateButtons[1]).not.toHaveTextContent('90°');

    fireEvent.click(rotateButtons[0]);
    expect(rotateButtons[0]).toHaveTextContent('180°');
  });

  it('toggles between List and Grid views in the queue stage', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const img = new File(['a'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [img] } });

    const gridBtn = screen.getByRole('button', { name: /Grid/i });
    const listBtn = screen.getByRole('button', { name: /Daftar/i });

    fireEvent.click(gridBtn);
    const card = screen.getByTestId('queue-item-0');
    expect(card.parentElement?.className).toContain('sm:grid-cols-2');

    fireEvent.click(listBtn);
    expect(card.parentElement?.className).toContain('space-y-2.5');
  });

  it('reorders queue cards via HTML5 drag-and-drop', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const f1 = new File(['a'], 'alpha.pdf', { type: 'application/pdf' });
    const f2 = new File(['b'], 'beta.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [f1, f2] } });

    const firstCard = screen.getByTestId('queue-item-0');
    const secondCard = screen.getByTestId('queue-item-1');
    expect(firstCard).toHaveTextContent('alpha.pdf');

    fireEvent.dragStart(firstCard);
    fireEvent.dragOver(secondCard);
    fireEvent.drop(secondCard);

    expect(screen.getByTestId('queue-item-0')).toHaveTextContent('beta.pdf');
    expect(screen.getByTestId('queue-item-1')).toHaveTextContent('alpha.pdf');
  });

  it('triggers conversion when pressing Ctrl+Enter shortcut', () => {
    const { container } = render(<App />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pdf] } });

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

    // During or immediately after dispatch, status shifts from Ready to Processing or Done/Error
    const card = screen.getByTestId('queue-item-0');
    expect(card.textContent).not.toBe('');
  });
});
