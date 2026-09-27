"use client";

import { FormEvent, useEffect, useState } from "react";

type Section = "resumen" | "movimientos" | "ingresos" | "deudas" | "mercado" | "analisis";
type Movement = {
  id: number;
  description: string;
  category: string;
  person: string;
  amount: number;
  kind: "gasto" | "ingreso";
  date: string;
};

const navigation: { id: Section; label: string; icon: string }[] = [
  { id: "resumen", label: "Resumen", icon: "◫" },
  { id: "movimientos", label: "Movimientos", icon: "↗" },
  { id: "ingresos", label: "Ingresos", icon: "＋" },
  { id: "deudas", label: "Deudas", icon: "▤" },
  { id: "mercado", label: "Mercado", icon: "▧" },
  { id: "analisis", label: "Análisis", icon: "⌁" },
];

const initialMovements: Movement[] = [
  { id: 1, description: "Mercado del barrio", category: "Alimentación", person: "Valentina", amount: 248600, kind: "gasto", date: "2026-09-24" },
  { id: 2, description: "Pago de servicios", category: "Hogar", person: "Andrés", amount: 186400, kind: "gasto", date: "2026-09-22" },
  { id: 3, description: "Nómina", category: "Salario", person: "Valentina", amount: 3850000, kind: "ingreso", date: "2026-09-20" },
  { id: 4, description: "Transporte", category: "Movilidad", person: "Andrés", amount: 92500, kind: "gasto", date: "2026-09-19" },
  { id: 5, description: "Nómina", category: "Salario", person: "Andrés", amount: 4200000, kind: "ingreso", date: "2026-09-15" },
];

const debts = [
  { name: "Crédito de vivienda", lender: "Banco principal", balance: 12800000, paid: 42, due: "5 oct" },
  { name: "Tarjeta de crédito", lender: "Banco principal", balance: 1840000, paid: 68, due: "12 oct" },
  { name: "Crédito de estudio", lender: "Fondo educativo", balance: 3260000, paid: 31, due: "18 oct" },
];

const marketHistory = [
  { month: "Septiembre 2026", store: "Mercado del barrio", total: 684200, items: 28 },
  { month: "Agosto 2026", store: "Éxito · compra mensual", total: 712850, items: 34 },
  { month: "Julio 2026", store: "Mercado campesino", total: 598400, items: 25 },
];

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function money(amount: number) {
  return currency.format(amount);
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

export default function Home() {
  const [section, setSection] = useState<Section>("resumen");
  const [movements, setMovements] = useState(initialMovements);
  const [marketItems, setMarketItems] = useState([
    { name: "Leche", quantity: "2 bolsas", checked: false },
    { name: "Huevos", quantity: "1 cubeta", checked: true },
    { name: "Arroz", quantity: "2 kg", checked: false },
    { name: "Tomate", quantity: "1 kg", checked: false },
  ]);
  const [newItem, setNewItem] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Septiembre 2026");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("casa-clara-movements");
    const savedItems = window.localStorage.getItem("casa-clara-market-items");
    if (saved) {
      try {
        setMovements(JSON.parse(saved) as Movement[]);
      } catch {
        window.localStorage.removeItem("casa-clara-movements");
      }
    }
    if (savedItems) {
      try {
        setMarketItems(JSON.parse(savedItems) as { name: string; quantity: string; checked: boolean }[]);
      } catch {
        window.localStorage.removeItem("casa-clara-market-items");
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem("casa-clara-movements", JSON.stringify(movements));
      window.localStorage.setItem("casa-clara-market-items", JSON.stringify(marketItems));
    }
  }, [hydrated, marketItems, movements]);

  const expenses = movements.filter((movement) => movement.kind === "gasto");
  const income = movements.filter((movement) => movement.kind === "ingreso");
  const totalExpenses = expenses.reduce((total, movement) => total + movement.amount, 0);
  const totalIncome = income.reduce((total, movement) => total + movement.amount, 0);
  const visibleMovements = movements.filter((movement) =>
    `${movement.description} ${movement.category} ${movement.person}`.toLowerCase().includes(search.toLowerCase()),
  );

  function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const amount = Number(values.get("amount"));
    if (!amount || amount < 0) return;
    setMovements((current) => [
      {
        id: Date.now(),
        description: String(values.get("description")),
        category: String(values.get("category")),
        person: String(values.get("person")),
        amount,
        kind: values.get("kind") === "ingreso" ? "ingreso" : "gasto",
        date: new Date().toISOString().slice(0, 10),
      },
      ...current,
    ]);
    setIsModalOpen(false);
  }

  function addMarketItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = newItem.trim();
    if (!item) return;
    setMarketItems((current) => [...current, { name: item, quantity: "", checked: false }]);
    setNewItem("");
  }

  function renderMovements(rows: Movement[]) {
    return (
      <div className="table-scroll">
        <table className="movement-table">
          <thead><tr><th>Concepto</th><th>Responsable</th><th>Fecha</th><th>Valor</th></tr></thead>
          <tbody>
            {rows.map((movement) => (
              <tr key={movement.id}>
                <td><span className={`category-mark ${movement.kind}`}>{movement.kind === "ingreso" ? "↑" : "•"}</span><span><strong>{movement.description}</strong><small>{movement.category}</small></span></td>
                <td>{movement.person}</td>
                <td>{dateLabel(movement.date)}</td>
                <td className={movement.kind === "ingreso" ? "amount-positive" : "amount-negative"}>{movement.kind === "ingreso" ? "+" : "−"}{money(movement.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSection() {
    if (section === "movimientos" || section === "ingresos") {
      const rows = section === "ingresos" ? income : visibleMovements;
      return (
        <section className="content-panel">
          <div className="panel-heading"><div><span className="eyebrow">REGISTRO DEL HOGAR</span><h2>{section === "ingresos" ? "Ingresos por persona" : "Todos los movimientos"}</h2></div><label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar movimiento" /></label></div>
          {section === "ingresos" && <div className="people-summary"><div><span>Valentina</span><strong>{money(income.filter((item) => item.person === "Valentina").reduce((sum, item) => sum + item.amount, 0))}</strong></div><div><span>Andrés</span><strong>{money(income.filter((item) => item.person === "Andrés").reduce((sum, item) => sum + item.amount, 0))}</strong></div></div>}
          {renderMovements(rows)}
        </section>
      );
    }

    if (section === "deudas") {
      return <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">COMPROMISOS ACTIVOS</span><h2>Deudas del hogar</h2></div><button className="quiet-button" onClick={() => setIsModalOpen(true)}>＋ Registrar pago</button></div><div className="debt-list">{debts.map((debt) => <article className="debt-row" key={debt.name}><div className="debt-title"><div><strong>{debt.name}</strong><small>{debt.lender}</small></div><span>Próximo pago · {debt.due}</span></div><div className="debt-progress"><div><span>Pagado {debt.paid}%</span><strong>Saldo {money(debt.balance)}</strong></div><div className="progress-track"><i style={{ width: `${debt.paid}%` }} /></div></div></article>)}</div><div className="debt-total"><span>Saldo total pendiente</span><strong>{money(debts.reduce((sum, debt) => sum + debt.balance, 0))}</strong></div></section>;
    }

    if (section === "mercado") {
      return <div className="market-layout"><section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">LISTA COMPARTIDA</span><h2>Próxima compra</h2></div><span className="list-count">{marketItems.filter((item) => !item.checked).length} pendientes</span></div><form className="add-item-form" onSubmit={addMarketItem}><input aria-label="Nuevo producto" value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Añadir producto a la lista" /><button className="quiet-button" type="submit">Añadir</button></form><ul className="shopping-list">{marketItems.map((item, index) => <li key={`${item.name}-${index}`} className={item.checked ? "checked" : ""}><label><input type="checkbox" checked={item.checked} onChange={() => setMarketItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, checked: !entry.checked } : entry))} /><span className="checkmark" /><strong>{item.name}</strong></label><span>{item.quantity}</span></li>)}</ul></section><section className="content-panel history-panel"><div className="panel-heading"><div><span className="eyebrow">COMPRAS ANTERIORES</span><h2>Historial de mercado</h2></div></div>{marketHistory.map((purchase) => <article className="history-row" key={purchase.month}><div><strong>{purchase.month}</strong><small>{purchase.store} · {purchase.items} productos</small></div><b>{money(purchase.total)}</b></article>)}</section></div>;
    }

    if (section === "analisis") {
      const categories = [{ name: "Vivienda", amount: 1280000, share: 78, color: "green" }, { name: "Alimentación", amount: 684200, share: 54, color: "coral" }, { name: "Movilidad", amount: 392000, share: 33, color: "blue" }, { name: "Servicios", amount: 286400, share: 24, color: "yellow" }];
      return <div className="analysis-grid"><section className="content-panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">FLUJO DE CAJA</span><h2>Ingresos y gastos</h2></div><select aria-label="Periodo" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Septiembre 2026</option><option>Agosto 2026</option><option>Julio 2026</option></select></div><div className="chart-legend"><span><i className="legend-income" /> Ingresos</span><span><i className="legend-expense" /> Gastos</span></div><div className="bar-chart">{["Abr", "May", "Jun", "Jul", "Ago", "Sep"].map((month, index) => <div className="bar-group" key={month}><div className="bar-pair"><i className="income-bar" style={{ height: `${[58, 70, 64, 81, 73, 88][index]}%` }} /><i className="expense-bar" style={{ height: `${[36, 48, 42, 54, 47, 61][index]}%` }} /></div><span>{month}</span></div>)}</div><div className="chart-foot"><span>Balance de septiembre</span><strong>{money(totalIncome - totalExpenses)}</strong></div></section><section className="content-panel category-panel"><div className="panel-heading"><div><span className="eyebrow">DÓNDE SE VA</span><h2>Gastos por categoría</h2></div></div>{categories.map((category) => <div className="category-stat" key={category.name}><div><span>{category.name}</span><strong>{money(category.amount)}</strong></div><div className="progress-track"><i className={category.color} style={{ width: `${category.share}%` }} /></div></div>)}</section></div>;
    }

    return (
      <div className="dashboard-grid">
        <section className="content-panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD RECIENTE</span><h2>Últimos movimientos</h2></div><button className="text-button" onClick={() => setSection("movimientos")}>Ver todos <span aria-hidden="true">→</span></button></div>{renderMovements(movements.slice(0, 5))}</section>
        <section className="content-panel household-panel"><div className="panel-heading"><div><span className="eyebrow">APORTES DE SEPTIEMBRE</span><h2>Ingresos del hogar</h2></div><button className="more-button" aria-label="Ver ingresos" onClick={() => setSection("ingresos")}>···</button></div><div className="person-row"><span className="avatar avatar-green">VA</span><div><strong>Valentina</strong><small>Ingreso registrado</small></div><b>{money(3850000)}</b></div><div className="person-row"><span className="avatar avatar-coral">AN</span><div><strong>Andrés</strong><small>Ingreso registrado</small></div><b>{money(4200000)}</b></div><div className="household-total"><span>Total del hogar</span><strong>{money(totalIncome)}</strong></div></section>
        <section className="content-panel budget-panel"><div><span className="eyebrow">PRESUPUESTO MENSUAL</span><h2>Gastos de septiembre</h2></div><div className="budget-amount"><strong>{money(totalExpenses)}</strong><span>de {money(5200000)}</span></div><div className="progress-track"><i style={{ width: `${Math.min((totalExpenses / 5200000) * 100, 100)}%` }} /></div><div className="budget-note"><span>Vas en el {Math.round((totalExpenses / 5200000) * 100)}% del presupuesto</span><span>{money(Math.max(5200000 - totalExpenses, 0))} disponible</span></div></section>
        <section className="content-panel market-teaser"><div><span className="eyebrow">LISTA DE COMPRA</span><h2>Mercado del hogar</h2><p>{marketItems.filter((item) => !item.checked).length} productos pendientes para la próxima compra</p></div><button className="quiet-button" onClick={() => setSection("mercado")}>Abrir lista <span aria-hidden="true">→</span></button></section>
      </div>
    );
  }

  const active = navigation.find((item) => item.id === section) ?? navigation[0];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio" onClick={() => setSection("resumen")}><span className="brand-mark">c.</span><span>casa clara<small>FINANZAS DEL HOGAR</small></span></a>
        <div className="home-switcher"><span className="home-avatar">H</span><span><strong>Hogar Valencia</strong><small>Plan familiar</small></span><span className="switch-chevron">⌄</span></div>
        <span className="nav-label">ESPACIO DEL HOGAR</span>
        <nav className="main-nav" aria-label="Navegación principal">{navigation.map((item) => <button className={section === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setSection(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === "mercado" && <span className="nav-badge">{marketItems.filter((entry) => !entry.checked).length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sync-status"><span className="status-dot" /><span><strong>Modo de prueba</strong><small>Datos guardados en este equipo</small></span></div><button className="profile-button"><span className="avatar avatar-dark">VA</span><span><strong>Valentina A.</strong><small>Administradora</small></span><span className="switch-chevron">···</span></button></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="breadcrumb">Hogar Valencia <span>/</span> <strong>{active.label}</strong></div><div className="topbar-actions"><label className="month-select"><span aria-hidden="true">◷</span><select aria-label="Mes seleccionado" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Septiembre 2026</option><option>Agosto 2026</option><option>Julio 2026</option></select></label><button className="primary-button" onClick={() => setIsModalOpen(true)}><span aria-hidden="true">＋</span> Nuevo movimiento</button></div></header>

        <div className="page-content"><div className="page-title"><div><span className="eyebrow">SÁBADO, 26 DE SEPTIEMBRE</span><h1>{section === "resumen" ? "Las cuentas, claras." : active.label}</h1><p>{section === "resumen" ? "Así se mueve el dinero de tu hogar este mes." : `Consulta y organiza ${active.label.toLowerCase()} de tu hogar.`}</p></div><span className="demo-chip"><i /> Vista previa</span></div>

          {section === "resumen" && <div className="summary-grid"><article className="summary-card balance-card"><span>Balance disponible</span><strong>{money(totalIncome - totalExpenses)}</strong><small>Ingresos menos gastos registrados</small><span className="card-sparkline" aria-hidden="true">⌁　⌁　⌁　⌁　⌁</span></article><article className="summary-card"><span>Ingresos del mes</span><strong>{money(totalIncome)}</strong><small><i className="metric-up">↑</i> 2 personas aportan al hogar</small><span className="summary-icon income-icon" aria-hidden="true">↗</span></article><article className="summary-card"><span>Gastos del mes</span><strong>{money(totalExpenses)}</strong><small>En {expenses.length} movimientos registrados</small><span className="summary-icon expense-icon" aria-hidden="true">↘</span></article><article className="summary-card"><span>Deuda pendiente</span><strong>{money(debts.reduce((sum, debt) => sum + debt.balance, 0))}</strong><small>3 compromisos activos</small><span className="summary-icon debt-icon" aria-hidden="true">▤</span></article></div>}

          {renderSection()}
          <footer className="page-footer"><span>Casa Clara <i>·</i> Tus finanzas, en familia.</span><span>Pesos colombianos <i>·</i> COP</span></footer>
        </div>
      </section>

      {isModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsModalOpen(false); }}><section className="movement-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">HOGAR VALENCIA</span><h2 id="modal-title">Nuevo movimiento</h2></div><button className="modal-close" aria-label="Cerrar" onClick={() => setIsModalOpen(false)}>×</button></div><form onSubmit={addMovement}><label>Tipo<select name="kind"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></label><label>Concepto<input name="description" required placeholder="Ej. Mercado semanal" /></label><div className="form-row"><label>Valor (COP)<input name="amount" type="number" min="1" step="1" required placeholder="0" /></label><label>Categoría<select name="category"><option>Alimentación</option><option>Hogar</option><option>Movilidad</option><option>Salud</option><option>Educación</option><option>Salario</option><option>Otros</option></select></label></div><label>¿Quién lo registra?<select name="person"><option>Valentina</option><option>Andrés</option></select></label><div className="modal-actions"><button type="button" className="quiet-button" onClick={() => setIsModalOpen(false)}>Cancelar</button><button type="submit" className="primary-button">Guardar movimiento</button></div></form></section></div>}
    </main>
  );
}
