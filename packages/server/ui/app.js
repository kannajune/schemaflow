import React from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { Background, Controls, Handle, Position, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import htm from 'htm';

    const html = htm.bind(React.createElement);

    // Shared column-pick state so table nodes can read/toggle without rebuilding
    // the node list (which would reset dragged positions).
    const ColCtx = React.createContext({
      checked: {}, toggle: () => {}, editMode: false, ops: [],
      addColumn: () => {}, dropColumn: () => {}, renameColumn: () => {},
      collapsed: {}, toggleCollapse: () => {},
    });

    const HEAD_H = 38;
    const ROW_H = 30;
    // Vertical center of a column row, used to pin handles to that row.
    const rowTop = (idx) => HEAD_H + idx * ROW_H + ROW_H / 2;

    // Apply pending edit operations to a table's columns so the diagram reflects
    // edits live (without rebuilding nodes and losing dragged positions).
    function applyOps(tableName, columns, ops) {
      let cols = columns.map((c) => ({ ...c }));
      for (const op of ops) {
        if (op.table !== tableName) continue;
        if (op.type === 'rename') cols = cols.map((c) => (c.name === op.from ? { ...c, name: op.to, added: c.added } : c));
        else if (op.type === 'drop') cols = cols.filter((c) => c.name !== op.name);
        else if (op.type === 'add') cols.push({ name: op.name, type: op.colType, nullable: true, isPrimaryKey: false, added: true });
      }
      return cols;
    }

    // Tokenized ALTER lines from the pending ops (for the Migration tab).
    function migrationLines(ops) {
      return ops.map((op) => {
        if (op.type === 'add')
          return [{ t: 'ALTER TABLE ', kw: true }, { t: op.table + ' ' }, { t: 'ADD COLUMN ', kw: true }, { t: op.name + ' ' + op.colType + ';' }];
        if (op.type === 'drop')
          return [{ t: 'ALTER TABLE ', kw: true }, { t: op.table + ' ' }, { t: 'DROP COLUMN ', kw: true }, { t: op.name + ';' }];
        return [{ t: 'ALTER TABLE ', kw: true }, { t: op.table + ' ' }, { t: 'RENAME COLUMN ', kw: true }, { t: op.from + ' ' }, { t: 'TO ', kw: true }, { t: op.to + ';' }];
      });
    }

    function TableNode({ data }) {
      const { checked, toggle, editMode, ops, addColumn, dropColumn, renameColumn, collapsed, toggleCollapse } =
        React.useContext(ColCtx);
      const [newName, setNewName] = React.useState('');
      const [newType, setNewType] = React.useState('VARCHAR(255)');
      const columns = applyOps(data.name, data.columns, ops);
      const isCollapsed = !!collapsed[data.name];
      const submitAdd = () => {
        const n = newName.trim();
        if (n) { addColumn(data.name, n, newType.trim() || 'TEXT'); setNewName(''); }
      };

      // Handle factory; `topPx` lets collapsed nodes keep edge anchors at the header.
      const handles = (c, topPx) =>
        ['l-target', 'l-source', 'r-target', 'r-source'].map((k) => {
          const [side, type] = k.split('-');
          return html`<${Handle}
            key=${k}
            id=${c.name + '-' + side + '-' + type[0]}
            type=${type}
            position=${side === 'l' ? Position.Left : Position.Right}
            className=${c.fkKind ? 'sf-h-' + c.fkKind : ''}
            style=${{ top: topPx + 'px', opacity: isCollapsed ? 0 : (c.fkKind || c.isPrimaryKey) ? 1 : 0 }}
          />`;
        });

      return html`
        <div class="sf-node" role="group" aria-label=${'Table ' + data.name + ', ' + columns.length + ' columns'}>
          <div class="sf-head">
            <button class="sf-collapse nodrag" aria-expanded=${!isCollapsed}
              aria-label=${(isCollapsed ? 'Expand ' : 'Collapse ') + data.name}
              onClick=${(e) => { e.stopPropagation(); toggleCollapse(data.name); }}>${isCollapsed ? '▸' : '▾'}</button>
            <span class="grip" aria-hidden="true">⠿</span>${data.name}
            ${isCollapsed ? html`<span class="sf-count">${columns.length}</span>` : ''}
          </div>
          ${isCollapsed
            ? columns
                .filter((c) => c.fkKind || c.isPrimaryKey)
                .map((c) => html`<span key=${c.name}>${handles(c, HEAD_H / 2)}</span>`)
            : columns.map((c, idx) => {
            const top = rowTop(idx);
            const colKey = data.name + '.' + c.name;
            return html`
              <div class="sf-col" key=${c.name}>
                ${handles(c, top)}
                <span class="sf-left">
                  <input
                    type="checkbox"
                    class="nodrag sf-check"
                    title="Include in SELECT"
                    checked=${!!checked[colKey]}
                    onChange=${() => toggle(colKey)}
                    onClick=${(e) => e.stopPropagation()}
                  />
                  <span class=${'sf-name' + (c.isPrimaryKey ? ' pk' : c.added ? ' added' : c.fkKind ? ' fk' : '')}>
                    ${c.isPrimaryKey ? '🔑 ' : ''}${c.name}
                    ${c.fkKind ? html`<span class=${'sf-badge fk'}>FK</span>` : ''}
                  </span>
                </span>
                ${editMode
                  ? html`<span class="sf-act nodrag" onClick=${(e) => e.stopPropagation()}>
                      <button class="sf-iconbtn" title="Rename" onClick=${() => {
                        const nn = window.prompt('Rename column ' + c.name + ' to:', c.name);
                        if (nn && nn.trim() && nn.trim() !== c.name) renameColumn(data.name, c.name, nn.trim());
                      }}>✎</button>
                      <button class="sf-iconbtn drop" title="Drop" onClick=${() => dropColumn(data.name, c.name)}>×</button>
                    </span>`
                  : html`<span class="sf-type">${c.type}</span>`}
              </div>`;
          })}
          ${editMode && !isCollapsed
            ? html`<div class="sf-addrow nodrag" onClick=${(e) => e.stopPropagation()}>
                <input class="nm" placeholder="new_column" value=${newName}
                  onChange=${(e) => setNewName(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === 'Enter') submitAdd(); }} />
                <input class="ty" placeholder="TYPE" value=${newType}
                  onChange=${(e) => setNewType(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === 'Enter') submitAdd(); }} />
                <button class="add" title="Add column" onClick=${submitAdd}>+</button>
              </div>`
            : ''}
        </div>`;
    }

    const nodeTypes = { table: TableNode };

    /**
     * Diagram -> SQL with AUTO JOIN-PATH FINDING.
     * Selecting two distant tables no longer needs you to hand-pick the
     * intermediates: a BFS over the relationship graph finds the shortest path
     * between them and pulls in the bridge tables automatically. Bridge joins are
     * marked `auto-joined`, inferred ones `inferred, verify`. Pure graph logic —
     * no LLM, no tokens.
     */
    function generateSql(schema, selected, checked) {
      if (!schema || selected.length === 0) return null;
      checked = checked || {};

      // Undirected adjacency over the relationship graph.
      const adj = {};
      for (const r of schema.relationships) {
        (adj[r.from.table] ||= []).push({ table: r.to.table, rel: r });
        (adj[r.to.table] ||= []).push({ table: r.from.table, rel: r });
      }

      // Shortest path (sequence of relationships) from any included table to target.
      function findPath(includedSet, target) {
        const visited = new Set(includedSet);
        const queue = [...includedSet].map((t) => ({ table: t, path: [] }));
        while (queue.length) {
          const cur = queue.shift();
          if (cur.table === target) return cur.path;
          for (const nb of adj[cur.table] || []) {
            if (!visited.has(nb.table)) {
              visited.add(nb.table);
              queue.push({ table: nb.table, path: [...cur.path, nb.rel] });
            }
          }
        }
        return null;
      }

      const selectedSet = new Set(selected);
      const fromTable = selected[0];
      const included = new Set([fromTable]);
      const joins = []; // { table, on, inferred, bridge }
      const unreachable = [];

      for (const target of selected.slice(1)) {
        if (included.has(target)) continue;
        const path = findPath(included, target);
        if (!path) {
          unreachable.push(target);
          continue;
        }
        for (const rel of path) {
          const newT = included.has(rel.from.table) ? rel.to.table : rel.from.table;
          if (included.has(newT)) continue;
          included.add(newT);
          joins.push({
            table: newT,
            on: `${rel.from.table}.${rel.from.column} = ${rel.to.table}.${rel.to.column}`,
            kind: rel.kind,
            bridge: !selectedSet.has(newT), // auto-added, not picked by the user
          });
        }
      }

      // Column picks: ticked > (user-selected table -> table.*) > (bridge -> nothing).
      const checkedKeys = Object.keys(checked);
      const colsFor = (t) => {
        const picks = checkedKeys.filter((k) => k.slice(0, k.indexOf('.')) === t);
        if (picks.length) return picks;
        return selectedSet.has(t) ? [t + '.*'] : [];
      };
      const orderedTables = [fromTable, ...joins.map((j) => j.table)];
      const selectCols = [];
      for (const t of orderedTables) for (const c of colsFor(t)) selectCols.push(c);
      if (selectCols.length === 0) selectCols.push(fromTable + '.*');

      // Build tokenized lines so we can syntax-highlight keywords/notes.
      const lines = [];
      lines.push([{ t: 'SELECT', kw: true }]);
      selectCols.forEach((c, i) => {
        lines.push([{ t: '  ' + c + (i < selectCols.length - 1 ? ',' : '') }]);
      });
      lines.push([{ t: 'FROM ', kw: true }, { t: fromTable }]);
      for (const j of joins) {
        const line = [{ t: 'JOIN ', kw: true }, { t: j.table + ' ' }, { t: 'ON ', kw: true }, { t: j.on }];
        const notes = [];
        if (j.bridge) notes.push('auto-joined');
        if (j.kind === 'observed') notes.push('observed in queries');
        else if (j.kind === 'inferred') notes.push('inferred, verify');
        if (notes.length) line.push({ t: '  -- ' + notes.join(', '), note: true });
        lines.push(line);
      }
      lines[lines.length - 1].push({ t: ';' });
      if (unreachable.length) {
        lines.push([{ t: '' }]);
        lines.push([{ t: '-- No join path to: ' + unreachable.join(', '), note: true }]);
      }
      return lines;
    }

    function tokensToText(lines) {
      return lines.map((line) => line.map((tk) => tk.t).join('')).join('\n');
    }

    // ---- Exports (Mermaid erDiagram + DBML) -------------------------------
    function toMermaid(schema) {
      const lines = [[{ t: 'erDiagram', kw: true }]];
      for (const t of schema.tables) {
        lines.push([{ t: t.name + ' {', kw: true }]);
        for (const c of t.columns) {
          const type = (c.type || 'text').replace(/\(.*\)/, '') || 'text';
          lines.push([{ t: '  ' + type + ' ' + c.name }, ...(c.isPrimaryKey ? [{ t: ' PK', note: true }] : [])]);
        }
        lines.push([{ t: '}', kw: true }]);
      }
      for (const r of schema.relationships) {
        // PK side is the "one" parent, FK side the "many" child.
        lines.push([{ t: r.to.table + ' ' }, { t: '||--o{', kw: true }, { t: ' ' + r.from.table + ' : ' }, { t: '"' + r.from.column + '"' }]);
      }
      return lines;
    }

    function toDbml(schema) {
      const lines = [];
      for (const t of schema.tables) {
        lines.push([{ t: 'Table ', kw: true }, { t: t.name + ' {' }]);
        for (const c of t.columns) {
          const attrs = [];
          if (c.isPrimaryKey) attrs.push('pk');
          if (!c.nullable && !c.isPrimaryKey) attrs.push('not null');
          lines.push([{ t: '  ' + c.name + ' ' + (c.type || 'text').toLowerCase() }, { t: attrs.length ? ' [' + attrs.join(', ') + ']' : '' }]);
        }
        lines.push([{ t: '}' }]);
        lines.push([{ t: '' }]);
      }
      for (const r of schema.relationships) {
        const note = r.kind !== 'declared' ? '  // ' + r.kind : '';
        lines.push([{ t: 'Ref: ', kw: true }, { t: r.from.table + '.' + r.from.column + ' > ' + r.to.table + '.' + r.to.column }, { t: note, note: !!note }]);
      }
      return lines;
    }

    // ---- Schema advisor (deterministic, no LLM / no tokens) ---------------
    function advise(schema) {
      const lines = [];
      const add = (tag, msg, fix) => {
        lines.push([{ t: tag + ' ', note: true }, { t: msg }]);
        if (fix) lines.push([{ t: '    ' + fix, kw: true }]);
      };
      for (const t of schema.tables) {
        if (!t.columns.some((c) => c.isPrimaryKey)) add('[no-pk]', 'Table `' + t.name + '` has no primary key.');
      }
      for (const r of schema.relationships) {
        if (r.kind !== 'declared') {
          add(
            '[' + r.kind + ']',
            '`' + r.from.table + '.' + r.from.column + '` references `' + r.to.table + '` with no FK constraint.',
            'ALTER TABLE ' + r.from.table + ' ADD FOREIGN KEY (' + r.from.column + ') REFERENCES ' + r.to.table + '(' + r.to.column + ');',
          );
        }
      }
      const fkCols = [...new Set(schema.relationships.map((r) => r.from.table + '.' + r.from.column))];
      for (const key of fkCols) add('[index]', 'Consider an index on FK column `' + key + '` for join performance.');
      for (const t of schema.tables) {
        const names = t.columns.map((c) => c.name.toLowerCase());
        if (!names.includes('created_at') && !names.includes('updated_at'))
          add('[audit]', 'Table `' + t.name + '` has no created_at/updated_at timestamp.');
      }
      if (!lines.length) return [[{ t: 'No suggestions — schema looks clean.' }]];
      return lines;
    }

    function RightPanel({ schema, selected, checked, ops, editMode, clearOps }) {
      const [tab, setTab] = React.useState('query');
      const [copied, setCopied] = React.useState(false);
      // Jump to the Migration tab when the user turns on Edit.
      React.useEffect(() => { if (editMode) setTab('migration'); }, [editMode]);

      // Tables in the query = node-selected UNION tables that have a ticked column,
      // so ticking a field pulls its table in automatically.
      const tables = React.useMemo(() => {
        const set = [...selected];
        for (const k of Object.keys(checked)) {
          const t = k.slice(0, k.indexOf('.'));
          if (!set.includes(t)) set.push(t);
        }
        return set;
      }, [selected, checked]);

      const [exportFmt, setExportFmt] = React.useState('mermaid');
      const queryLines = React.useMemo(() => generateSql(schema, tables, checked), [schema, tables, checked]);
      const migLines = React.useMemo(() => migrationLines(ops), [ops]);
      const exportLines = React.useMemo(
        () => (exportFmt === 'mermaid' ? toMermaid(schema) : toDbml(schema)),
        [schema, exportFmt],
      );
      const advisorLines = React.useMemo(() => advise(schema), [schema]);

      const lines =
        tab === 'query' ? queryLines
        : tab === 'migration' ? (migLines.length ? migLines : null)
        : tab === 'export' ? exportLines
        : advisorLines;
      const text = lines ? tokensToText(lines) : '';
      const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      };

      return html`
        <div class="sf-sql">
          <div class="bar">
            <div class="tabs">
              <button class=${'tab' + (tab === 'query' ? ' on' : '')} onClick=${() => setTab('query')}>Query · ${tables.length}</button>
              <button class=${'tab' + (tab === 'migration' ? ' on' : '')} onClick=${() => setTab('migration')}>Migration · ${ops.length}</button>
              <button class=${'tab' + (tab === 'export' ? ' on' : '')} onClick=${() => setTab('export')}>Export</button>
              <button class=${'tab' + (tab === 'advisor' ? ' on' : '')} onClick=${() => setTab('advisor')}>Advisor</button>
            </div>
            ${lines ? html`<button class="copy" onClick=${copy}>${copied ? 'Copied ✓' : 'Copy'}</button>` : ''}
          </div>
          ${tab === 'export'
            ? html`<div class="subbar">
                <button class=${'tab' + (exportFmt === 'mermaid' ? ' on' : '')} onClick=${() => setExportFmt('mermaid')}>Mermaid</button>
                <button class=${'tab' + (exportFmt === 'dbml' ? ' on' : '')} onClick=${() => setExportFmt('dbml')}>DBML</button>
              </div>`
            : ''}
          ${lines
            ? html`<pre>${lines.map(
                (line, li) => html`<div key=${li}>${line.map(
                  (tk, ti) => html`<span key=${ti} class=${tk.kw ? 'kw' : tk.note ? 'note' : ''}>${tk.t}</span>`,
                )}</div>`,
              )}</pre>`
            : html`<div class="empty">${tab === 'query'
                ? 'Tick fields or shift-click tables to build a JOIN query.'
                : 'Turn on Edit, then add / rename / drop columns to generate migration SQL.'}</div>`}
          ${tab === 'migration' && ops.length
            ? html`<div class="migbar"><button class="copy ghost" onClick=${clearOps}>Clear edits</button></div>`
            : ''}
        </div>`;
    }

    function buildGraph(data) {
      const COLS = 4;
      const GAP_X = 330;
      const GAP_Y = 340;
      const pos = {};
      data.tables.forEach((t, i) => {
        pos[t.name] = { x: (i % COLS) * GAP_X, y: Math.floor(i / COLS) * GAP_Y };
      });

      // Mark which columns are foreign keys (and whether declared/inferred) so the
      // node can badge them and color their handle.
      const fkKind = {};
      for (const r of data.relationships) {
        fkKind[r.from.table + '.' + r.from.column] = r.kind;
      }

      const nodes = data.tables.map((t) => ({
        id: t.name,
        type: 'table',
        position: pos[t.name],
        data: {
          name: t.name,
          columns: t.columns.map((c) => ({ ...c, fkKind: fkKind[t.name + '.' + c.name] })),
        },
      }));

      const EDGE_COLOR = { declared: '#38bdf8', observed: '#2dd4bf', inferred: '#f59e0b' };
      const edges = data.relationships.map((r) => {
        const color = EDGE_COLOR[r.kind] || '#f59e0b';
        const dashed = r.kind !== 'declared';
        // Dynamic side selection: leave from the side that faces the target so
        // lines stop wrapping around the node.
        const sourceRight = pos[r.from.table].x <= pos[r.to.table].x;
        const sourceHandle = r.from.column + '-' + (sourceRight ? 'r' : 'l') + '-s';
        const targetHandle = r.to.column + '-' + (sourceRight ? 'l' : 'r') + '-t';
        return {
          id: r.id,
          source: r.from.table,
          target: r.to.table,
          sourceHandle,
          targetHandle,
          animated: r.kind === 'inferred',
          label: r.kind === 'inferred' ? '≈' : '',
          labelStyle: { fill: color, fontWeight: 700 },
          labelBgStyle: { fill: '#0b0f17' },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          style: dashed
            ? { stroke: color, strokeDasharray: '6 4', strokeWidth: 1.6 }
            : { stroke: color, strokeWidth: 1.8 },
        };
      });

      return { nodes, edges };
    }

    function App() {
      // Controlled state via React Flow hooks — required for drag to "stick".
      const [nodes, setNodes, onNodesChange] = useNodesState([]);
      const [edges, setEdges, onEdgesChange] = useEdgesState([]);
      const [meta, setMeta] = React.useState(null);
      const [schema, setSchema] = React.useState(null);
      const [selected, setSelected] = React.useState([]);
      const [checked, setChecked] = React.useState({});
      const [editMode, setEditMode] = React.useState(false);
      const [ops, setOps] = React.useState([]);
      const [collapsed, setCollapsed] = React.useState({});

      const toggleCollapse = React.useCallback((table) => {
        setCollapsed((prev) => {
          const next = { ...prev };
          if (next[table]) delete next[table];
          else next[table] = true;
          return next;
        });
      }, []);

      const toggle = React.useCallback((key) => {
        setChecked((prev) => {
          const next = { ...prev };
          if (next[key]) delete next[key];
          else next[key] = true;
          return next;
        });
      }, []);
      const addColumn = React.useCallback((table, name, colType) => setOps((p) => [...p, { type: 'add', table, name, colType }]), []);
      const dropColumn = React.useCallback((table, name) => setOps((p) => [...p, { type: 'drop', table, name }]), []);
      const renameColumn = React.useCallback((table, from, to) => setOps((p) => [...p, { type: 'rename', table, from, to }]), []);
      const clearOps = React.useCallback(() => setOps([]), []);
      const colCtx = React.useMemo(
        () => ({ checked, toggle, editMode, ops, addColumn, dropColumn, renameColumn, collapsed, toggleCollapse }),
        [checked, toggle, editMode, ops, addColumn, dropColumn, renameColumn, collapsed, toggleCollapse],
      );

      React.useEffect(() => {
        const apply = (data) => {
          const g = buildGraph(data);
          setNodes(g.nodes);
          setEdges(g.edges);
          setMeta({ tables: data.tables.length, ...data.meta });
          setSchema(data);
        };
        // Embedded host (VS Code / JetBrains webview) injects the model directly;
        // the CLI server path falls back to fetch.
        if (window.__SCHEMAFLOW_MODEL__) apply(window.__SCHEMAFLOW_MODEL__);
        else fetch('/api/schema').then((r) => r.json()).then(apply);
      }, []);

      const onSelectionChange = React.useCallback(
        ({ nodes: sel }) => setSelected(sel.map((n) => n.id)),
        [],
      );

      if (!meta) return html`<div class="sf-loading">Loading schema…</div>`;

      return html`
        <${ColCtx.Provider} value=${colCtx}>
        <${ReactFlow}
          nodes=${nodes}
          edges=${edges}
          onNodesChange=${onNodesChange}
          onEdgesChange=${onEdgesChange}
          onSelectionChange=${onSelectionChange}
          nodeTypes=${nodeTypes}
          fitView
          minZoom=${0.2}
          defaultEdgeOptions=${{ type: 'default' }}
        >
          <${Background} color="#1a2334" gap=${22} />
          <${Controls} />
          <div class="sf-toolbar">
            <button class=${'sf-edit' + (editMode ? ' on' : '')} onClick=${() => setEditMode((v) => !v)}>
              ${editMode ? '✓ Editing schema' : '✎ Edit schema'}
            </button>
          </div>
          <div class="sf-legend">
            <h4>${meta.tables} tables</h4>
            <div class="row"><span class="sf-line"></span> Declared FK · fact (${meta.declaredCount})</div>
            <div class="row"><span class="sf-line teal"></span> Observed in queries (${meta.observedCount})</div>
            <div class="row"><span class="sf-line dashed"></span> Inferred · verify (${meta.inferredCount})</div>
            <div class="sf-hint">Arrow FK → PK · shift-click → SQL · ▾ collapses · Export/Advisor in panel.</div>
          </div>
          <${RightPanel}
            schema=${schema}
            selected=${selected}
            checked=${checked}
            ops=${ops}
            editMode=${editMode}
            clearOps=${clearOps}
          />
        <//>
        <//>`;
    }

    createRoot(document.getElementById('root')).render(html`<${App} />`);
  