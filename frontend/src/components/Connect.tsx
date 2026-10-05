import { useState } from 'react';
import { archiveConnected, mcpUrl } from '../api';
import { useT } from '../i18n';

const TOOLS = [
  ['search_theses', 'Find theses by topic, method, author or concept, optionally within one Centre.'],
  ['get_thesis', 'Full metadata for one thesis, with its Centre and a link back to this site.'],
  ['related_records', 'Follow the knowledge graph from a thesis to its authors, concepts, Centre and related theses.'],
  ['list_centres', 'The AIMS Centres in the controlled list.'],
  ['ask_theses', 'Answer a question from chosen theses only, citing each claim as [n].'],
  ['propose_directions', 'Exploratory research directions from gaps in the concept graph.'],
];

function Snippet({ title, code }: { title: string; code: string }) {
  const t = useT(); const [copied, setCopied] = useState('');
  return <figure className="snippet"><figcaption><span>{title}</span><button className="text-button" onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(t('Copied.')), () => setCopied('Select the text to copy it.'))}>{t('Copy')}</button><span role="status" className="meta">{copied}</span></figcaption><pre><code>{code}</code></pre></figure>;
}

export default function Connect() {
  const t = useT(); const url = mcpUrl();
  return <article className="page reading-page">
    <header className="page-header"><p className="eyebrow">Model Context Protocol</p><h1>{t('Connect an agent')}</h1>
      <p className="page-description">Sankofa is an MCP server. Hermes Agent, and any other MCP client, can search the archive, read records, walk the knowledge graph and ask cited questions. Every tool is read-only.</p></header>
    {!archiveConnected && <p className="service-notice">This website is not connected to an archive service yet, so the address below is a placeholder. Use your API server’s address followed by <code>/mcp/</code>.</p>}
    <section className="section"><h2>Hermes Agent</h2>
      <p>Add Sankofa to <code>~/.hermes/config.yaml</code> under <code>mcp_servers</code>, then run <code>/reload-mcp</code> in a Hermes session.</p>
      <Snippet title="Remote archive (HTTP)" code={`mcp_servers:\n  sankofa:\n    url: "${url}"\n    tools:\n      prompts: false\n      resources: false`} />
      <Snippet title="Local archive (stdio, run from the Sankofa checkout)" code={`mcp_servers:\n  sankofa:\n    command: "sankofa"\n    args: ["mcp"]\n    env:\n      LA_NEO4J_URI: "bolt://localhost:7687"`} />
    </section>
    <section className="section"><h2>Other MCP clients</h2><p>Clients that accept a streamable HTTP server use the same address:</p><Snippet title="Endpoint" code={url} /></section>
    <section className="section"><h2>Tools</h2><dl className="tool-list">{TOOLS.map(([name, text]) => <div key={name}><dt className="mono">{name}</dt><dd>{text}</dd></div>)}</dl></section>
    <section className="section"><h2>For administrators</h2>
      <p>Install the agent extra with <code>pip install 'sankofa[agents]'</code>. The API then serves MCP at <code>/mcp/</code>. Requests are accepted from <code>localhost</code> by default. To serve a public hostname, set <code>LA_MCP_ALLOWED_HOSTS='["archive.example.org"]'</code>. Set <code>LA_PUBLIC_URL</code> to this website’s address so tool results link back to records.</p>
    </section>
  </article>;
}
