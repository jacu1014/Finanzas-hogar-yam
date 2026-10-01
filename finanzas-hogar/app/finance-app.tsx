"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/app/lib/supabase";

type Section = "resumen" | "movimientos" | "deudas" | "mercado" | "analisis" | "familia";
type Person = { id: string; name: string; relationship: string; user_id: string | null };
type Movement = {
  id: string;
  description: string;
  category: string;
  amount: number;
  kind: "income" | "expense";
  occurred_on: string;
  person_id: string | null;
  household_people: { name: string } | { name: string }[] | null;
};

type Debt = { id: string; name: string; creditor: string; original_amount: number; balance: number; due_date: string | null };
type MarketItem = { id: string; name: string; quantity: string; is_checked: boolean };
type PurchaseLine = { id: string; name: string; quantity: number; unit: string; unit_price: number; line_total: number };
type Purchase = { id: string; store: string; purchased_on: string; created_at: string; total_amount: number; market_purchase_items: PurchaseLine[] };
type PurchaseDraftLine = { key: string; name: string; quantity: string; unit: string; unit_price: string };
type Household = { id: string; name: string; currency: string; monthly_budget: number | null; invite_code: string };
type AuthUser = { id: string; email?: string; user_metadata: { display_name?: string } };

const supabase = getSupabaseClient();
const navigation: { id: Section; label: string; icon: string }[] = [
  { id: "resumen", label: "Resumen", icon: "◫" },
  { id: "movimientos", label: "Movimientos", icon: "↗" },
  { id: "deudas", label: "Deudas", icon: "▤" },
  { id: "mercado", label: "Mercado", icon: "▧" },
  { id: "analisis", label: "Análisis", icon: "⌁" },
  { id: "familia", label: "Mi familia", icon: "♧" },
];

function money(amount: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount || 0);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function personName(movement: Movement) {
  const person = movement.household_people;
  return Array.isArray(person) ? person[0]?.name ?? "" : person?.name ?? "";
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-mark">＋</span><strong>{title}</strong><p>{detail}</p></div>;
}

export default function FinanceApp() {
  const [user, setUser] = useState<AuthUser>({ id: "", user_metadata: {} });
  const [hasUser, setHasUser] = useState(false);
  const [section, setSection] = useState<Section>("resumen");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authMessage, setAuthMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [busy, setBusy] = useState(false);
  const [householdState, setHousehold] = useState<Household>({ id: "", name: "", currency: "COP", monthly_budget: null, invite_code: "" });
  const [households, setHouseholds] = useState<Household[]>([]);
  const [hasHousehold, setHasHousehold] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [shoppingListId, setShoppingListId] = useState<string | null>(null);
  const [shoppingItems, setShoppingItems] = useState<MarketItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseDraftLine[]>([{ key: "line-1", name: "", quantity: "1", unit: "unidad", unit_price: "" }]);
  const [query, setQuery] = useState("");
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [newMarketItem, setNewMarketItem] = useState("");

  async function loadWorkspace(currentUser: AuthUser, requestedHouseholdId?: string, quiet = false) {
    if (!supabase) return;
    const finishLoading = () => {
      if (!quiet) setLoading(false);
    };
    if (!quiet) setLoading(true);
    setErrorMessage("");
    const memberships = await supabase
      .from("household_members")
      .select("household_id, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (memberships.error) {
      setErrorMessage("No se pudo consultar el hogar. Confirma que ejecutaste las migraciones de Supabase.");
      finishLoading();
      return;
    }
    if (!memberships.data?.length) {
      setHouseholds([]);
      setHasHousehold(false);
      finishLoading();
      return;
    }

    const householdIds = memberships.data.map((membership) => membership.household_id);
    const homesResult = await supabase.from("households").select("id, name, currency, monthly_budget, invite_code").in("id", householdIds);
    if (homesResult.error || !homesResult.data?.length) {
      setErrorMessage("No se pudieron cargar los hogares asociados a esta cuenta.");
      finishLoading();
      return;
    }

    const availableHomes = homesResult.data as Household[];
    const storedHouseholdId = window.localStorage.getItem(`casa-clara-active-household-${currentUser.id}`);
    const householdId = [requestedHouseholdId, storedHouseholdId, memberships.data[0].household_id]
      .find((candidate) => candidate && availableHomes.some((home) => home.id === candidate)) ?? availableHomes[0].id;
    const activeHousehold = availableHomes.find((home) => home.id === householdId) ?? availableHomes[0];
    setHouseholds(availableHomes);
    setHousehold(activeHousehold);
    setHasHousehold(true);
    window.localStorage.setItem(`casa-clara-active-household-${currentUser.id}`, activeHousehold.id);

    const [peopleResult, movementsResult, debtsResult, listsResult, purchasesResult] = await Promise.all([
      supabase.from("household_people").select("id, name, relationship, user_id").eq("household_id", householdId).order("created_at"),
      supabase.from("transactions").select("id, description, category, amount, kind, occurred_on, person_id, household_people(name)").eq("household_id", householdId).order("occurred_on", { ascending: false }),
      supabase.from("debts").select("id, name, creditor, original_amount, balance, due_date").eq("household_id", householdId).order("created_at", { ascending: false }),
      supabase.from("shopping_lists").select("id").eq("household_id", householdId).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("market_purchases").select("id, store, purchased_on, created_at, total_amount, market_purchase_items(id, name, quantity, unit, unit_price, line_total)").eq("household_id", householdId).order("purchased_on", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    const failed = [peopleResult, movementsResult, debtsResult, listsResult, purchasesResult].find((result) => result.error);
    if (failed?.error) {
      setErrorMessage("No se pudieron cargar los datos del hogar. Revisa que aplicaste la migración de perfiles familiares.");
      finishLoading();
      return;
    }

    setPeople((peopleResult.data ?? []) as Person[]);
    setMovements((movementsResult.data ?? []) as Movement[]);
    setDebts((debtsResult.data ?? []) as Debt[]);
    setPurchases((purchasesResult.data ?? []) as Purchase[]);

    let activeList = listsResult.data;
    if (!activeList) {
      const createdList = await supabase.from("shopping_lists").insert({ household_id: householdId, created_by: currentUser.id, name: "Mercado" }).select("id").single();
      if (createdList.error) {
        setErrorMessage("El hogar se cargó, pero no se pudo crear su lista de mercado.");
        finishLoading();
        return;
      }
      activeList = createdList.data;
    }
    setShoppingListId(activeList.id);
    const itemsResult = await supabase.from("shopping_list_items").select("id, name, quantity, is_checked").eq("list_id", activeList.id).order("created_at");
    if (itemsResult.error) setErrorMessage("No se pudieron cargar los productos de la lista.");
    else setShoppingItems((itemsResult.data ?? []) as MarketItem[]);
    finishLoading();
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const currentUser = data.session?.user as AuthUser | undefined;
      if (currentUser) {
        setUser(currentUser);
        setHasUser(true);
        void loadWorkspace(currentUser);
      } else {
        setHasUser(false);
        setLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const currentUser = session?.user as AuthUser | undefined;
      if (currentUser) {
        setUser(currentUser);
        setHasUser(true);
        void loadWorkspace(currentUser);
      } else {
        setHasUser(false);
        setHasHousehold(false);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !hasUser || !householdState.id || !shoppingListId) return;
    const activeHouseholdId = householdState.id;
    const refresh = () => void loadWorkspace(user, activeHouseholdId, true);
    const channel = supabase
      .channel(`household:${activeHouseholdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "debts", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_people", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_purchases", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_purchase_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_lists", filter: `household_id=eq.${activeHouseholdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_list_items", filter: `list_id=eq.${shoppingListId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hasUser, householdState.id, shoppingListId, user]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthMessage("");
    setErrorMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const displayName = String(form.get("display_name") ?? "").trim();
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) setErrorMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Te enviamos un correo para confirmar tu cuenta. Después vuelve e inicia sesión.");
    else setAuthMessage(authMode === "signup" ? "Cuenta creada. Vamos a configurar tu hogar." : "Sesión iniciada.");
    setBusy(false);
  }

  async function switchHousehold(householdId: string) {
    setErrorMessage("");
    await loadWorkspace(user, householdId);
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(householdState.invite_code);
      setAuthMessage("Código copiado. Compártelo con quien quieras invitar al hogar.");
    } catch {
      setErrorMessage("No se pudo copiar el código. Selecciónalo y cópialo manualmente.");
    }
  }

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser) return;
    setBusy(true);
    setErrorMessage("");
    const form = new FormData(event.currentTarget);
    const householdName = String(form.get("household_name")).trim();
    const displayName = String(form.get("display_name")).trim();
    const otherNames = String(form.get("other_names")).split(",").map((name) => name.trim()).filter(Boolean);
    const budget = Number(form.get("monthly_budget")) || null;
    const created = await supabase.from("households").insert({ name: householdName, currency: "COP", created_by: user.id, monthly_budget: budget }).select("id").single();
    if (created.error) {
      setErrorMessage(created.error.message);
      setBusy(false);
      return;
    }
    const membership = await supabase.from("household_members").insert({ household_id: created.data.id, user_id: user.id, display_name: displayName, role: "admin" });
    if (membership.error) {
      setErrorMessage(membership.error.message);
      setBusy(false);
      return;
    }
    const profiles = [displayName, ...otherNames].map((name) => ({ household_id: created.data.id, created_by: user.id, user_id: name === displayName ? user.id : null, name, relationship: name === displayName ? "Administrador/a" : "Familiar" }));
    const addedPeople = await supabase.from("household_people").insert(profiles);
    if (addedPeople.error) {
      setErrorMessage(addedPeople.error.message);
      setBusy(false);
      return;
    }
    const list = await supabase.from("shopping_lists").insert({ household_id: created.data.id, created_by: user.id, name: "Mercado" });
    if (list.error) setErrorMessage(list.error.message);
    await loadWorkspace(user);
    setBusy(false);
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser || !householdState.id) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    if (!amount || amount <= 0) return;
    setBusy(true);
    const result = await supabase.from("transactions").insert({
      household_id: householdState.id,
      created_by: user.id,
      description: String(form.get("description")).trim(),
      category: String(form.get("category")),
      amount,
      kind: String(form.get("kind")),
      occurred_on: String(form.get("occurred_on")),
      person_id: String(form.get("person_id") || "") || null,
    });
    if (result.error) setErrorMessage(result.error.message);
    else {
      setShowMovementForm(false);
      await loadWorkspace(user);
    }
    setBusy(false);
  }

  async function addDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser || !householdState.id) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("balance"));
    setBusy(true);
    const result = await supabase.from("debts").insert({
      household_id: householdState.id,
      created_by: user.id,
      name: String(form.get("name")).trim(),
      creditor: String(form.get("creditor")).trim(),
      original_amount: amount,
      balance: amount,
      due_date: String(form.get("due_date") || "") || null,
    });
    if (result.error) setErrorMessage(result.error.message);
    else {
      setShowDebtForm(false);
      await loadWorkspace(user);
    }
    setBusy(false);
  }

  async function addMarketItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser || !shoppingListId || !newMarketItem.trim()) return;
    const result = await supabase.from("shopping_list_items").insert({ list_id: shoppingListId, created_by: user.id, name: newMarketItem.trim() }).select("id, name, quantity, is_checked").single();
    if (result.error) setErrorMessage(result.error.message);
    else {
      setShoppingItems((current) => [...current, result.data as MarketItem]);
      setNewMarketItem("");
    }
  }

  async function toggleMarketItem(item: MarketItem) {
    if (!supabase) return;
    const result = await supabase.from("shopping_list_items").update({ is_checked: !item.is_checked }).eq("id", item.id);
    if (result.error) setErrorMessage(result.error.message);
    else setShoppingItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_checked: !item.is_checked } : entry));
  }

  async function removeMarketItem(item: MarketItem) {
    if (!supabase) return;
    const result = await supabase.from("shopping_list_items").delete().eq("id", item.id);
    if (result.error) setErrorMessage(result.error.message);
    else setShoppingItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  async function clearCheckedMarketItems() {
    if (!supabase) return;
    const checkedItems = shoppingItems.filter((item) => item.is_checked);
    if (!checkedItems.length) return;
    if (!window.confirm(`¿Eliminar ${checkedItems.length} producto${checkedItems.length === 1 ? "" : "s"} marcado${checkedItems.length === 1 ? "" : "s"} como comprado?`)) return;
    const checkedIds = checkedItems.map((item) => item.id);
    const result = await supabase.from("shopping_list_items").delete().in("id", checkedIds);
    if (result.error) setErrorMessage(result.error.message);
    else setShoppingItems((current) => current.filter((item) => !checkedIds.includes(item.id)));
  }

  function updatePurchaseLine(key: string, field: keyof Omit<PurchaseDraftLine, "key">, value: string) {
    setPurchaseLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  function addPurchaseLine() {
    setPurchaseLines((current) => [...current, { key: `line-${Date.now()}`, name: "", quantity: "1", unit: "unidad", unit_price: "" }]);
  }

  async function savePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser || !householdState.id) return;
    const validLines = purchaseLines
      .map((line) => ({
        name: line.name.trim(),
        quantity: Number(line.quantity),
        unit: line.unit.trim() || "unidad",
        unit_price: Number(line.unit_price),
      }))
      .filter((line) => line.name && line.quantity > 0 && line.unit_price >= 0);
    if (!validLines.length) {
      setErrorMessage("Agrega al menos un producto con cantidad y precio válidos.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const purchasedOn = String(form.get("purchased_on"));
    const store = String(form.get("store")).trim();
    const totalAmount = validLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    setBusy(true);
    setErrorMessage("");
    const purchaseResult = await supabase.from("market_purchases").insert({
      household_id: householdState.id,
      created_by: user.id,
      store,
      purchased_on: purchasedOn,
      total_amount: totalAmount,
    }).select("id").single();

    if (purchaseResult.error) {
      setErrorMessage(purchaseResult.error.message);
      setBusy(false);
      return;
    }

    const itemResult = await supabase.from("market_purchase_items").insert(validLines.map((line) => ({
      purchase_id: purchaseResult.data.id,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      line_total: line.quantity * line.unit_price,
    })));

    if (itemResult.error) {
      await supabase.from("market_purchases").delete().eq("id", purchaseResult.data.id);
      setErrorMessage(`No se pudo guardar la compra: ${itemResult.error.message}`);
      setBusy(false);
      return;
    }

    setPurchaseLines([{ key: `line-${Date.now()}`, name: "", quantity: "1", unit: "unidad", unit_price: "" }]);
    setShowPurchaseForm(false);
    await loadWorkspace(user);
    setBusy(false);
  }

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser || !householdState.id) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    if (!name) return;
    const result = await supabase.from("household_people").insert({ household_id: householdState.id, created_by: user.id, name, relationship: String(form.get("relationship")) }).select("id, name, relationship, user_id").single();
    if (result.error) setErrorMessage(result.error.message);
    else setPeople((current) => [...current, result.data as Person]);
    event.currentTarget.reset();
  }

  async function joinHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !hasUser) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setErrorMessage("");
    setAuthMessage("");
    const { data, error } = await supabase.rpc("join_household_by_code", {
      join_code: code,
      member_display_name: joinDisplayName.trim() || user.user_metadata.display_name || user.email || "Familiar",
    });
    if (error) {
      setErrorMessage(error.message);
      setBusy(false);
      return;
    }
    setJoinCode("");
    setAuthMessage("Te uniste al hogar. Sus datos ya están compartidos con sus miembros.");
    await loadWorkspace(user, data as string);
    setSection("resumen");
    setBusy(false);
  }

  async function updateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !householdState) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("monthly_budget")) || null;
    const result = await supabase.from("households").update({ monthly_budget: amount }).eq("id", householdState.id);
    if (result.error) setErrorMessage(result.error.message);
    else setHousehold({ ...householdState, monthly_budget: amount });
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
  }

  const expenses = movements.filter((movement) => movement.kind === "expense");
  const income = movements.filter((movement) => movement.kind === "income");
  const totalExpenses = expenses.reduce((sum, movement) => sum + Number(movement.amount), 0);
  const totalIncome = income.reduce((sum, movement) => sum + Number(movement.amount), 0);
  const debtBalance = debts.reduce((sum, debt) => sum + Number(debt.balance), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentExpenses = expenses.filter((movement) => movement.occurred_on.startsWith(currentMonth)).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const filteredMovements = movements.filter((movement) => `${movement.description} ${movement.category} ${personName(movement)}`.toLowerCase().includes(query.toLowerCase()));
  const currentDate = new Date();
  const currentMarketMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const priorMarketMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const priorMarketMonth = `${priorMarketMonthDate.getFullYear()}-${String(priorMarketMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const marketTotalsByMonth = purchases.reduce((totals, purchase) => {
    const month = purchase.purchased_on.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + Number(purchase.total_amount));
    return totals;
  }, new Map<string, number>());
  const currentMarketTotal = marketTotalsByMonth.get(currentMarketMonth) ?? 0;
  const priorMarketTotal = marketTotalsByMonth.get(priorMarketMonth) ?? 0;
  const marketTotalDifference = currentMarketTotal - priorMarketTotal;
  const marketTotalChange = priorMarketTotal ? (marketTotalDifference / priorMarketTotal) * 100 : null;
  const marketMonthLabel = (month: string) => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  const productPriceHistory = purchases.flatMap((purchase) => purchase.market_purchase_items.map((item) => ({ ...item, purchase_id: purchase.id, purchased_on: purchase.purchased_on, created_at: purchase.created_at, store: purchase.store }))).sort((left, right) => right.purchased_on.localeCompare(left.purchased_on) || right.created_at.localeCompare(left.created_at));
  const latestProductPrices = productPriceHistory.filter((item, index, all) => all.findIndex((candidate) => `${candidate.name.trim().toLowerCase()}|${candidate.unit.trim().toLowerCase()}` === `${item.name.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`) === index);
  const productPriceComparisons = latestProductPrices.map((item) => {
    const previous = productPriceHistory.find((candidate) => candidate.purchase_id !== item.purchase_id && (candidate.purchased_on < item.purchased_on || (candidate.purchased_on === item.purchased_on && candidate.created_at < item.created_at)) && `${candidate.name.trim().toLowerCase()}|${candidate.unit.trim().toLowerCase()}` === `${item.name.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`);
    const change = previous ? Number(item.unit_price) - Number(previous.unit_price) : null;
    const changePercent = previous && Number(previous.unit_price) ? (Number(change) / Number(previous.unit_price)) * 100 : null;
    return { ...item, previous, change, changePercent };
  });

  if (!supabase) {
    return <main className="auth-shell"><section className="auth-card"><a className="brand auth-brand" href="#"><span className="brand-mark">c.</span><span>casa clara<small>FINANZAS DEL HOGAR</small></span></a><span className="eyebrow">CONFIGURACIÓN NECESARIA</span><h1>Conecta tu hogar</h1><p>Configura las variables de Supabase para habilitar el acceso familiar.</p><div className="setup-help"><strong>Variables requeridas</strong><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code><small>En local, agrégalas a <b>.env.local</b>. En Vercel, añádelas en Settings → Environment Variables y redepliega.</small></div></section></main>;
  }

  if (!hasUser) {
    return <main className="auth-shell"><section className="auth-card"><a className="brand auth-brand" href="#"><span className="brand-mark">c.</span><span>casa clara<small>FINANZAS DEL HOGAR</small></span></a><span className="eyebrow">UN ESPACIO PARA TU FAMILIA</span><h1>{authMode === "login" ? "Bienvenidos a casa." : "Crea tu acceso familiar."}</h1><p>{authMode === "login" ? "Inicia sesión para ver las cuentas de tu hogar." : "Registra una cuenta y configura los datos de tu hogar."}</p><form className="auth-form" onSubmit={handleAuth}>{authMode === "signup" && <label>Tu nombre<input name="display_name" autoComplete="name" required placeholder="Nombre y apellido" /></label>}<label>Correo electrónico<input name="email" type="email" autoComplete="email" required placeholder="tu@correo.com" /></label><label>Contraseña<input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="Mínimo 8 caracteres" /></label><button className="primary-button auth-submit" disabled={busy}>{busy ? "Un momento…" : authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}</button></form><button className="auth-switch" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthMessage(""); setErrorMessage(""); }}>{authMode === "login" ? "¿Primera vez? Crear una cuenta" : "Ya tengo una cuenta · Iniciar sesión"}</button>{authMessage && <p className="success-message">{authMessage}</p>}{errorMessage && <p className="error-message">{errorMessage}</p>}<p className="auth-foot">Acceso privado · Datos protegidos por tu hogar</p></section></main>;
  }

  if (loading) return <main className="auth-shell"><div className="loading-message">Cargando el espacio de tu familia…</div></main>;

  if (!hasHousehold) {
    return <main className="auth-shell"><section className="auth-card onboarding-card"><div className="panel-heading"><div><span className="eyebrow">PRIMER PASO</span><h1>Cuéntanos de tu hogar.</h1></div><button className="text-button" onClick={logout}>Cerrar sesión</button></div><p>Agrega los nombres de tu familia y el presupuesto mensual si ya lo tienes. Puedes completar los demás datos después.</p><form className="auth-form" onSubmit={createHousehold}><label>Nombre del hogar<input name="household_name" required placeholder="Ej. Familia Gómez" /></label><label>Tu nombre<input name="display_name" defaultValue={user.user_metadata.display_name ?? ""} required placeholder="Nombre y apellido" /></label><label>Otros perfiles familiares <span className="optional-label">no crean cuentas de acceso</span><input name="other_names" placeholder="Nombres separados por coma (opcional)" /></label><label>Presupuesto mensual en COP <span className="optional-label">opcional</span><input name="monthly_budget" type="number" min="0" step="1000" placeholder="Lo puedes definir luego" /></label><button className="primary-button auth-submit" disabled={busy}>{busy ? "Creando hogar…" : "Crear mi hogar"}</button></form><p className="auth-foot">Después podrás invitar cuentas familiares desde Mi familia con un código de hogar.</p>{errorMessage && <p className="error-message">{errorMessage}</p>}</section></main>;
  }

  const active = navigation.find((item) => item.id === section) ?? navigation[0];

  function renderTransactions(rows: Movement[]) {
    if (!rows.length) return <EmptyState title="Aún no hay movimientos" detail="Registra un ingreso o gasto real para empezar a ver el flujo del hogar." />;
    return <div className="table-scroll"><table className="movement-table"><thead><tr><th>Concepto</th><th>Persona</th><th>Fecha</th><th>Valor</th></tr></thead><tbody>{rows.map((movement) => <tr key={movement.id}><td><span className={`category-mark ${movement.kind === "income" ? "ingreso" : "gasto"}`}>{movement.kind === "income" ? "↑" : "•"}</span><span><strong>{movement.description}</strong><small>{movement.category}</small></span></td><td>{Array.isArray(movement.household_people) ? movement.household_people[0]?.name ?? "Sin asignar" : movement.household_people?.name ?? "Sin asignar"}</td><td>{shortDate(movement.occurred_on)}</td><td className={movement.kind === "income" ? "amount-positive" : "amount-negative"}>{movement.kind === "income" ? "+" : "−"}{money(Number(movement.amount), householdState.currency)}</td></tr>)}</tbody></table></div>;
  }

  function renderMarket() {
    const draftTotal = purchaseLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);
    return (
      <div className="market-workspace">
        <section className="market-summary-grid">
          <article className="market-summary-card"><span>{marketMonthLabel(currentMarketMonth)}</span><strong>{money(currentMarketTotal, householdState.currency)}</strong><small>{purchases.filter((purchase) => purchase.purchased_on.startsWith(currentMarketMonth)).length} compras registradas</small></article>
          <article className="market-summary-card"><span>{marketMonthLabel(priorMarketMonth)}</span><strong>{money(priorMarketTotal, householdState.currency)}</strong><small>{purchases.filter((purchase) => purchase.purchased_on.startsWith(priorMarketMonth)).length} compras registradas</small></article>
          <article className={`market-summary-card ${marketTotalDifference < 0 ? "saving" : marketTotalDifference > 0 ? "increase" : ""}`}><span>Variación mensual total</span><strong>{marketTotalChange === null ? "Sin referencia" : `${marketTotalDifference > 0 ? "+" : marketTotalDifference < 0 ? "−" : ""}${money(Math.abs(marketTotalDifference), householdState.currency)}`}</strong><small>{marketTotalChange === null ? "Registra compras en ambos meses" : `${marketTotalChange > 0 ? "Subió" : marketTotalChange < 0 ? "Bajó" : "Se mantuvo"} ${Math.abs(marketTotalChange).toFixed(1)}% frente al mes anterior`}</small></article>
        </section>

        <section className="content-panel purchase-entry-panel">
          <div className="panel-heading"><div><span className="eyebrow">CONTROL DE PRECIOS</span><h2>Compra de mercado</h2></div><button className="quiet-button" onClick={() => setShowPurchaseForm((value) => !value)}>{showPurchaseForm ? "Cerrar" : "＋ Registrar compra"}</button></div>
          {showPurchaseForm && <form className="purchase-form" onSubmit={savePurchase}>
            <div className="inline-form purchase-meta"><label>Supermercado o tienda<input name="store" placeholder="Ej. Mercado del barrio" /></label><label>Fecha de compra<input name="purchased_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label></div>
            <div className="purchase-lines-heading"><strong>Productos y precios</strong><span>El total se calcula con cantidad × precio unitario.</span></div>
            <div className="purchase-line-list">{purchaseLines.map((line) => <div className="purchase-line" key={line.key}>
              <label>Producto<input value={line.name} onChange={(event) => updatePurchaseLine(line.key, "name", event.target.value)} placeholder="Ej. Arroz" required /></label>
              <label>Cantidad<input value={line.quantity} onChange={(event) => updatePurchaseLine(line.key, "quantity", event.target.value)} type="number" min="0.001" step="0.001" required /></label>
              <label>Unidad<select value={line.unit} onChange={(event) => updatePurchaseLine(line.key, "unit", event.target.value)}><option>unidad</option><option>kg</option><option>g</option><option>lb</option><option>litro</option><option>ml</option><option>paquete</option><option>docena</option></select></label>
              <label>Precio por unidad<input value={line.unit_price} onChange={(event) => updatePurchaseLine(line.key, "unit_price", event.target.value)} type="number" min="0" step="1" placeholder="0" required /></label>
              <button className="remove-line-button" type="button" aria-label={`Quitar ${line.name || "producto"}`} disabled={purchaseLines.length === 1} onClick={() => setPurchaseLines((current) => current.filter((entry) => entry.key !== line.key))}>×</button>
            </div>)}</div>
            <div className="purchase-form-footer"><button className="text-button" type="button" onClick={addPurchaseLine}>＋ Añadir producto</button><div className="purchase-total"><span>Total de la compra</span><strong>{money(draftTotal, householdState.currency)}</strong></div><button className="primary-button" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar compra"}</button></div>
          </form>}
        </section>

        <div className="market-layout">
          <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">COMPARACIÓN POR PRODUCTO</span><h2>¿Subió o bajó?</h2></div></div>
            {productPriceComparisons.length ? <div className="price-comparison-list">{productPriceComparisons.map((item) => <article className="price-comparison-row" key={`${item.name}-${item.unit}`}><div><strong>{item.name}</strong><small>{item.quantity} {item.unit} · {item.store || "Tienda sin nombre"} · {shortDate(item.purchased_on)}</small></div><div className="price-comparison-current"><strong>{money(Number(item.unit_price), householdState.currency)} <small>/ {item.unit}</small></strong>{item.previous ? <span className={item.change === 0 ? "price-same" : item.change! < 0 ? "price-lower" : "price-higher"}>{item.change === 0 ? "Sin cambio" : `${item.change! < 0 ? "↓ Más económico" : "↑ Más costoso"} ${Math.abs(item.changePercent ?? 0).toFixed(1)}%`}</span> : <span className="price-first">Primera compra registrada</span>}</div><div className="price-comparison-previous"><span>Precio anterior</span><strong>{item.previous ? money(Number(item.previous.unit_price), householdState.currency) : "—"}</strong></div></article>)}</div> : <EmptyState title="Aún no hay precios para comparar" detail="Registra tu primera compra con los precios de cada producto; la siguiente compra mostrará las diferencias." />}
          </section>
          <section className="content-panel history-panel"><div className="panel-heading"><div><span className="eyebrow">COMPRAS REGISTRADAS</span><h2>Total por compra</h2></div></div>
            {purchases.length ? purchases.map((purchase) => <article className="history-row" key={purchase.id}><div><strong>{shortDate(purchase.purchased_on)} · {purchase.store || "Mercado"}</strong><small>{purchase.market_purchase_items.length} productos</small></div><b>{money(Number(purchase.total_amount), householdState.currency)}</b></article>) : <EmptyState title="Sin compras anteriores" detail="Cada mercado guardado aparecerá aquí con su total." />}
          </section>
        </div>

        <section className="content-panel shopping-list-panel"><div className="panel-heading"><div><span className="eyebrow">LISTA COMPARTIDA</span><h2>Próxima compra</h2></div><div className="shopping-list-actions"><span className="list-count">{shoppingItems.filter((item) => !item.is_checked).length} pendientes</span>{shoppingItems.some((item) => item.is_checked) && <button className="text-button clear-checked-button" type="button" onClick={() => void clearCheckedMarketItems()}>Limpiar comprados</button>}</div></div><form className="add-item-form" onSubmit={addMarketItem}><input aria-label="Nuevo producto" value={newMarketItem} onChange={(event) => setNewMarketItem(event.target.value)} placeholder="Añadir producto a la lista" /><button className="quiet-button" type="submit">Añadir</button></form>{shoppingItems.length ? <ul className="shopping-list">{shoppingItems.map((item) => <li key={item.id} className={item.is_checked ? "checked" : ""}><label><input type="checkbox" checked={item.is_checked} onChange={() => void toggleMarketItem(item)} /><span className="checkmark" /><strong>{item.name}</strong></label><div className="shopping-item-actions">{item.quantity && <span>{item.quantity}</span>}<button className="remove-shopping-item" type="button" aria-label={`Eliminar ${item.name} de la lista`} title="Eliminar producto" onClick={() => void removeMarketItem(item)}>×</button></div></li>)}</ul> : <EmptyState title="Lista vacía" detail="Agrega productos que necesite tu familia en la próxima compra." />}{errorMessage && <p className="error-message">{errorMessage}</p>}</section>
      </div>
    );
  }

  function renderModule() {
    if (section === "movimientos") return <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">REGISTRO DEL HOGAR</span><h2>Movimientos</h2></div><label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar movimiento" /></label></div>{renderTransactions(filteredMovements)}</section>;
    if (section === "deudas") return <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">COMPROMISOS DEL HOGAR</span><h2>Deudas</h2></div><button className="quiet-button" onClick={() => setShowDebtForm((value) => !value)}>＋ Registrar deuda</button></div>{showDebtForm && <form className="inline-form debt-form" onSubmit={addDebt}><label>Nombre<input name="name" required placeholder="Ej. Crédito de vivienda" /></label><label>Acreedor<input name="creditor" placeholder="Banco o persona" /></label><label>Saldo actual en COP<input name="balance" type="number" min="1" required placeholder="0" /></label><label>Próximo pago<input name="due_date" type="date" /></label><button className="primary-button" disabled={busy}>Guardar deuda</button></form>}{debts.length ? <div className="debt-list">{debts.map((debt) => <article className="debt-row" key={debt.id}><div className="debt-title"><div><strong>{debt.name}</strong><small>{debt.creditor || "Acreedor no especificado"}</small></div><span>{debt.due_date ? `Próximo pago · ${shortDate(debt.due_date)}` : "Sin fecha de pago"}</span></div><div className="debt-progress"><div><span>Saldo pendiente</span><strong>{money(Number(debt.balance), householdState.currency)}</strong></div><div className="progress-track"><i style={{ width: `${Math.min((1 - Number(debt.balance) / Number(debt.original_amount)) * 100, 100)}%` }} /></div></div></article>)}</div> : !showDebtForm && <EmptyState title="No hay deudas registradas" detail="Si tu familia tiene compromisos pendientes, puedes agregarlos aquí." />}<div className="debt-total"><span>Saldo total pendiente</span><strong>{money(debtBalance, householdState.currency)}</strong></div></section>;
    if (section === "mercado") return renderMarket();
    if (section === "analisis") return <section className="content-panel"><div className="panel-heading"><div><span className="eyebrow">LECTURA DE TUS DATOS</span><h2>Resumen financiero</h2></div></div>{movements.length ? <><div className="analysis-totals"><div><span>Ingresos registrados</span><strong>{money(totalIncome, householdState.currency)}</strong></div><div><span>Gastos registrados</span><strong>{money(totalExpenses, householdState.currency)}</strong></div><div><span>Balance</span><strong>{money(totalIncome - totalExpenses, householdState.currency)}</strong></div></div><h3 className="subheading">Gastos por categoría</h3>{Array.from(expenses.reduce((groups, movement) => groups.set(movement.category, (groups.get(movement.category) ?? 0) + Number(movement.amount)), new Map<string, number>())).map(([category, amount]) => <div className="category-stat" key={category}><div><span>{category}</span><strong>{money(amount, householdState.currency)}</strong></div><div className="progress-track"><i style={{ width: `${totalExpenses ? (amount / totalExpenses) * 100 : 0}%` }} /></div></div>)}</> : <EmptyState title="El análisis aparecerá aquí" detail="Primero registra ingresos y gastos. Las gráficas se calcularán solo con información de tu hogar." />}</section>;
    if (section === "familia") return <div className="family-layout">
      <section className="content-panel">
        <div className="panel-heading"><div><span className="eyebrow">PERSONAS DEL HOGAR</span><h2>{householdState.name}</h2></div></div>
        <div className="invite-code-row"><div><span className="eyebrow">CÓDIGO PARA UNIRSE A ESTE HOGAR</span><strong>{householdState.invite_code}</strong><small>Compártelo solo con las personas que deban acceder a las finanzas del hogar.</small></div><button className="quiet-button" type="button" onClick={() => void copyInviteCode()}>Copiar código</button></div>
        {authMessage && <p className="success-message">{authMessage}</p>}
        <div className="family-list">{people.map((person) => <div className="family-row" key={person.id}><span className="avatar avatar-green">{person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.relationship} · {person.user_id ? "Cuenta conectada" : "Perfil familiar"}</small></div><span className="person-income">{money(income.filter((movement) => movement.person_id === person.id).reduce((sum, movement) => sum + Number(movement.amount), 0), householdState.currency)}<small>ingresos registrados</small></span></div>)}</div>
        <form className="inline-form add-family-form" onSubmit={addPerson}><label>Nombre del familiar<input name="name" required placeholder="Nombre y apellido" /></label><label>Relación<select name="relationship"><option>Familiar</option><option>Pareja</option><option>Hijo/a</option><option>Madre / padre</option><option>Otro</option></select></label><button className="quiet-button" type="submit">＋ Agregar perfil</button></form>
      </section>
      <section className="content-panel">
        <div className="panel-heading"><div><span className="eyebrow">COMPARTIR HOGAR</span><h2>Unirse a otro hogar</h2></div></div>
        <p className="panel-description">Introduce el código que te compartió un administrador. Tu cuenta quedará vinculada al mismo hogar y podrás alternar entre hogares desde la barra superior.</p>
        <form className="auth-form" onSubmit={joinHousehold}><label>Tu nombre<input value={joinDisplayName} onChange={(event) => setJoinDisplayName(event.target.value)} placeholder={user.user_metadata.display_name ?? user.email ?? "Nombre y apellido"} /></label><label>Código de invitación<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required placeholder="Ej. A1B2C3D4E5" /></label><button className="primary-button" disabled={busy}>{busy ? "Uniendo cuenta…" : "Unirme al hogar"}</button></form>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </section>
      <section className="content-panel">
        <div className="panel-heading"><div><span className="eyebrow">PLANIFICACIÓN</span><h2>Presupuesto mensual</h2></div></div>
        <form className="auth-form" onSubmit={updateBudget}><label>Presupuesto del hogar en COP<input name="monthly_budget" type="number" min="0" step="1000" defaultValue={householdState.monthly_budget ?? ""} placeholder="Sin definir" /></label><button className="primary-button">Guardar presupuesto</button></form>
        <div className="account-note"><span>Cuenta activa</span><strong>{user.email}</strong><button className="text-button" onClick={logout}>Cerrar sesión</button></div>
      </section>
    </div>;

    return <div className="dashboard-grid"><section className="content-panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD RECIENTE</span><h2>Últimos movimientos</h2></div><button className="text-button" onClick={() => setSection("movimientos")}>Ver todos <span aria-hidden="true">→</span></button></div>{renderTransactions(movements.slice(0, 5))}</section><section className="content-panel household-panel"><div className="panel-heading"><div><span className="eyebrow">INGRESOS POR PERSONA</span><h2>Aportes del hogar</h2></div><button className="more-button" aria-label="Ver familia" onClick={() => setSection("familia")}>···</button></div>{people.length ? people.map((person) => <div className="person-row" key={person.id}><span className="avatar avatar-green">{person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.relationship}</small></div><b>{money(income.filter((movement) => movement.person_id === person.id).reduce((sum, movement) => sum + Number(movement.amount), 0), householdState.currency)}</b></div>) : <EmptyState title="Agrega a tu familia" detail="Completa los perfiles desde Mi familia." />}<div className="household-total"><span>Ingresos del hogar</span><strong>{money(totalIncome, householdState.currency)}</strong></div></section><section className="content-panel budget-panel"><div><span className="eyebrow">PRESUPUESTO MENSUAL</span><h2>Gastos de este mes</h2></div><div className="budget-amount"><strong>{money(currentExpenses, householdState.currency)}</strong><span>{householdState.monthly_budget ? `de ${money(Number(householdState.monthly_budget), householdState.currency)}` : "sin presupuesto definido"}</span></div>{householdState.monthly_budget ? <><div className="progress-track"><i style={{ width: `${Math.min((currentExpenses / Number(householdState.monthly_budget)) * 100, 100)}%` }} /></div><div className="budget-note"><span>{Math.round((currentExpenses / Number(householdState.monthly_budget)) * 100)}% utilizado</span><span>{money(Math.max(Number(householdState.monthly_budget) - currentExpenses, 0), householdState.currency)} disponible</span></div></> : <button className="text-button" onClick={() => setSection("familia")}>Definir presupuesto →</button>}</section><section className="content-panel market-teaser"><div><span className="eyebrow">LISTA DE COMPRA</span><h2>Mercado del hogar</h2><p>{shoppingItems.filter((item) => !item.is_checked).length} productos pendientes</p></div><button className="quiet-button" onClick={() => setSection("mercado")}>Abrir lista <span aria-hidden="true">→</span></button></section></div>;
  }

  return <main className="app-shell"><aside className="sidebar"><a className="brand" href="#inicio" onClick={() => setSection("resumen")}><span className="brand-mark">c.</span><span>casa clara<small>FINANZAS DEL HOGAR</small></span></a><div className="home-switcher"><span className="home-avatar">{householdState.name.slice(0, 1).toUpperCase()}</span><span><strong>{householdState.name}</strong><small>Hogar familiar</small></span></div><span className="nav-label">ESPACIO DEL HOGAR</span><nav className="main-nav" aria-label="Navegación principal">{navigation.map((item) => <button className={section === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setSection(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === "mercado" && shoppingItems.length > 0 && <span className="nav-badge">{shoppingItems.filter((entry) => !entry.is_checked).length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="sync-status"><span className="status-dot connected" /><span><strong>Conectado a Supabase</strong><small>Datos sincronizados</small></span></div><button className="profile-button" onClick={logout}><span className="avatar avatar-dark">{(user.user_metadata.display_name ?? user.email ?? "F").slice(0, 1).toUpperCase()}</span><span><strong>{user.user_metadata.display_name ?? user.email}</strong><small>Cerrar sesión</small></span><span className="switch-chevron">↪</span></button></div></aside><section className="workspace"><header className="topbar"><div className="breadcrumb">{householdState.name} <span>/</span> <strong>{active.label}</strong></div><div className="topbar-actions">{households.length > 1 && <label className="household-select-label"><span className="sr-only">Hogar activo</span><select className="household-select" aria-label="Cambiar hogar activo" value={householdState.id} onChange={(event) => void switchHousehold(event.target.value)}>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label>}<span className="currency-label">{householdState.currency}</span><button className="primary-button" onClick={() => setShowMovementForm((value) => !value)}><span aria-hidden="true">＋</span> Nuevo movimiento</button></div></header><div className="page-content"><div className="page-title"><div><span className="eyebrow">{new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toLocaleUpperCase("es-CO")}</span><h1>{section === "resumen" ? "Las cuentas, claras." : active.label}</h1><p>{section === "resumen" ? `Información real de ${householdState.name}.` : `Organiza ${active.label.toLowerCase()} de tu hogar.`}</p></div><span className="connected-chip"><i /> Datos de tu hogar</span></div>{errorMessage && <div className="inline-error">{errorMessage}</div>}{showMovementForm && <section className="content-panel form-panel"><div className="panel-heading"><div><span className="eyebrow">REGISTRO FAMILIAR</span><h2>Nuevo movimiento</h2></div><button className="modal-close" aria-label="Cerrar formulario" onClick={() => setShowMovementForm(false)}>×</button></div><form className="inline-form" onSubmit={addMovement}><label>Tipo<select name="kind"><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label><label>Concepto<input name="description" required placeholder="Ej. Mercado semanal" /></label><label>Valor en COP<input name="amount" type="number" min="1" required placeholder="0" /></label><label>Categoría<select name="category"><option>Alimentación</option><option>Hogar</option><option>Movilidad</option><option>Salud</option><option>Educación</option><option>Salario</option><option>Otros</option></select></label><label>Persona<select name="person_id"><option value="">Sin asignar</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Fecha<input name="occurred_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><button className="primary-button" disabled={busy}>Guardar movimiento</button></form></section>}{section === "resumen" && <div className="summary-grid"><article className="summary-card balance-card"><span>Balance registrado</span><strong>{money(totalIncome - totalExpenses, householdState.currency)}</strong><small>Ingresos menos gastos cargados</small><span className="card-sparkline" aria-hidden="true">⌁　⌁　⌁</span></article><article className="summary-card"><span>Ingresos</span><strong>{money(totalIncome, householdState.currency)}</strong><small>{income.length} movimientos</small><span className="summary-icon income-icon" aria-hidden="true">↗</span></article><article className="summary-card"><span>Gastos</span><strong>{money(totalExpenses, householdState.currency)}</strong><small>{expenses.length} movimientos</small><span className="summary-icon expense-icon" aria-hidden="true">↘</span></article><article className="summary-card"><span>Deuda pendiente</span><strong>{money(debtBalance, householdState.currency)}</strong><small>{debts.length} deudas registradas</small><span className="summary-icon debt-icon" aria-hidden="true">▤</span></article></div>}{renderModule()}<footer className="page-footer"><span>Casa Clara <i>·</i> {householdState.name}</span><span>Datos privados <i>·</i> {householdState.currency}</span></footer></div></section></main>;
}
