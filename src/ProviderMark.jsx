import React from 'react';
import github from '../assets/providers/github.svg';
import curseforge from '../assets/providers/curseforge.svg';
import wago from '../assets/providers/wago.ico';
const marks = { GitHub: github, CurseForge: curseforge, Wago: wago };
export default function ProviderMark({ name, small = false }) {
  return marks[name] ? (
    <img
      className={
        'provider-mark ' + (name === 'Wago' ? 'wago ' : 'monochrome ') + (small ? 'small' : '')
      }
      src={marks[name]}
      alt=""
      aria-hidden="true"
    />
  ) : null;
}
