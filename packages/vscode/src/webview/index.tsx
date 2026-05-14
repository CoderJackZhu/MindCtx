import './styles/outline.css';
import './styles/mindmap.css';
import { h, render } from 'preact';
import { App } from './App.js';

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
