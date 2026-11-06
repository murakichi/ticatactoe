import React from 'react';
import fs from 'fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';
const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('button.square'));
it('dom', () => {
  const out: string[] = [];
  jest.spyOn(Math, 'random').mockReturnValue(0.37);
  const chars = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'cryomancer', 'pyromancer', 'witch', 'keysmith'] as const;
  for (const ch of chars) {
    const { container, unmount } = render(<Game players={[{ character: ch, isAI: false, gears: ['bindingLock', 'sturdy'] }, { character: 'you', isAI: false }]} />);
    out.push(ch + ' init ' + container.innerHTML.length + ' ' + container.innerHTML);
    fireEvent.click(cells(container)[0]); fireEvent.click(cells(container)[5]);
    fireEvent.click(screen.getByRole('button', { name: /チャージ\+\d/ }));
    out.push(ch + ' after ' + container.innerHTML);
    unmount();
  }
  const { container } = render(<Game players={[{ character: 'giant', isAI: false }, { character: 'witch', isAI: false }, { character: 'keysmith', isAI: false }]} />);
  out.push('3p ' + container.innerHTML);
  fs.writeFileSync(process.env.DOM_OUT as string, out.join('\n'));
});
