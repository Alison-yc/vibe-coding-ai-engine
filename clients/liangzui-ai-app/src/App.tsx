import { useState } from 'react';
import reactLogo from './assets/react.svg';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';

function App() {
  const [greetMsg, setGreetMsg] = useState('');
  const [name, setName] = useState('');

  async function greet() {
    setGreetMsg(await invoke('greet', { name }));
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to Tauri + React</h1>

      <div className="flex items-center gap-6">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="h-16 w-16" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="h-16 w-16" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="h-16 w-16" alt="React logo" />
        </a>
      </div>

      <p className="text-muted-foreground">
        Click on the Tauri, Vite, and React logos to learn more.
      </p>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void greet();
        }}
      >
        <input
          id="greet-input"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-64 rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <Button type="submit">Greet</Button>
      </form>

      {greetMsg ? <p className="text-sm">{greetMsg}</p> : null}
    </main>
  );
}

export default App;
