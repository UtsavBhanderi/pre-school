import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createAuthenticatedApi } from "../api.js";
import "../school-insights.css";

const api = createAuthenticatedApi();

const localDateValue = (date) => (
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0")
);

const getDefaultRange = (days) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    return { startDate: localDateValue(start), endDate: localDateValue(end) };
};

const formatCurrency = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Number(value) || 0);

const formatDate = (value, options = {}) => {
    if (!value) return "—";
    const date = new Date(value + "T00:00:00");
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        ...options,
    });
};

const EMPTY_OVERVIEW = {
    students: { active: 0, withdrawn: 0, newAdmissions: 0 },
    teachers: { total: 0 },
    attendance: { present: 0, absent: 0, marked: 0, attendanceRate: 0, daily: [] },
    fees: { collectedInRange: 0, paymentsInRange: 0, outstanding: 0, paidToDate: 0, daily: [] },
};

export default function SchoolInsightsPage() {
    const initialRange = useMemo(() => getDefaultRange(30), []);
    const [startDate, setStartDate] = useState(initialRange.startDate);
    const [endDate, setEndDate] = useState(initialRange.endDate);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const loadOverview = useCallback(async (signal) => {
        setLoading(true);
        setError("");
        try {
            const response = await api.get("/api/admin/overview", {
                params: { startDate, endDate },
                signal,
            });
            setOverview(response.data || EMPTY_OVERVIEW);
        } catch (requestError) {
            if (requestError.code !== "ERR_CANCELED") {
                setError(requestError.response?.data?.message || "Unable to load management insights.");
                setOverview(null);
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        const controller = new AbortController();
        loadOverview(controller.signal);
        return () => controller.abort();
    }, [loadOverview, refreshKey]);

    const applyPreset = (days) => {
        const range = getDefaultRange(days);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
    };

    const data = overview || EMPTY_OVERVIEW;
    const maxAttendance = Math.max(1, ...data.attendance.daily.map((item) => item.marked));
    const maxCollection = Math.max(1, ...data.fees.daily.map((item) => item.collected));
    const attendancePercentage = data.attendance.attendanceRate || 0;

    return (
        <main className="school-insights-page">
            <header className="school-insights-header">
                <div>
                    <p className="school-insights-eyebrow">SCHOOL MANAGEMENT</p>
                    <h1>Management insights</h1>
                    <p>Understand attendance, admissions and fee collection without opening several registers.</p>
                </div>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </header>

            <section className="school-insights-filter" aria-label="Choose report period">
                <div className="school-insights-presets">
                    {[7, 30, 90].map((days) => {
                        const preset = getDefaultRange(days);
                        const active = startDate === preset.startDate && endDate === preset.endDate;
                        return (
                            <button
                                key={days}
                                type="button"
                                className={"btn btn-sm " + (active ? "btn-primary" : "btn-outline-secondary")}
                                onClick={() => applyPreset(days)}
                                aria-pressed={active}
                            >
                                {days} days
                            </button>
                        );
                    })}
                </div>
                <div className="school-insights-date-fields">
                    <label>
                        <span>From</span>
                        <input className="form-control form-control-sm" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
                    </label>
                    <label>
                        <span>To</span>
                        <input className="form-control form-control-sm" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
                    </label>
                </div>
                <span className="school-insights-filter-note">Up to 90 days per report</span>
            </section>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}

            <section className="school-insights-kpis" aria-label="School summary" aria-live="polite">
                <article className="school-insights-kpi">
                    <span>Active children</span>
                    <strong>{loading ? "…" : overview ? data.students.active.toLocaleString("en-IN") : "—"}</strong>
                    <small>{data.students.withdrawn.toLocaleString("en-IN")} withdrawn records retained</small>
                </article>
                <article className="school-insights-kpi">
                    <span>New admissions</span>
                    <strong>{loading ? "…" : overview ? data.students.newAdmissions.toLocaleString("en-IN") : "—"}</strong>
                    <small>Within the selected period</small>
                </article>
                <article className="school-insights-kpi">
                    <span>Teachers and staff</span>
                    <strong>{loading ? "…" : overview ? data.teachers.total.toLocaleString("en-IN") : "—"}</strong>
                    <small>Staff records in the school</small>
                </article>
                <article className="school-insights-kpi">
                    <span>Fees still due</span>
                    <strong>{loading ? "…" : overview ? formatCurrency(data.fees.outstanding) : "—"}</strong>
                    <small>After payments and discounts</small>
                </article>
            </section>

            <section className="school-insights-secondary" aria-label="Selected period totals">
                <div>
                    <span>Fees collected in this period</span>
                    <strong>{loading ? "…" : overview ? formatCurrency(data.fees.collectedInRange) : "—"}</strong>
                    <small>{data.fees.paymentsInRange.toLocaleString("en-IN")} payment entries</small>
                </div>
                <div>
                    <span>Attendance marked</span>
                    <strong>{loading ? "…" : overview ? data.attendance.marked.toLocaleString("en-IN") : "—"}</strong>
                    <small>{data.attendance.present} present · {data.attendance.absent} absent entries</small>
                </div>
                <div>
                    <span>Present share</span>
                    <strong>{loading ? "…" : overview ? attendancePercentage.toFixed(1) + "%" : "—"}</strong>
                    <small>Of attendance entries recorded in this period</small>
                </div>
                <div>
                    <span>All-time fees paid</span>
                    <strong>{loading ? "…" : overview ? formatCurrency(data.fees.paidToDate) : "—"}</strong>
                    <small>Including legacy opening balances</small>
                </div>
            </section>

            <section className="school-insights-charts">
                <article className="school-insights-card">
                    <div className="school-insights-card-heading">
                        <div>
                            <h2>Attendance trend</h2>
                            <p>Daily children marked present and absent</p>
                        </div>
                        <span className="school-insights-legend">
                            <i className="is-present" /> Present <i className="is-absent" /> Absent
                        </span>
                    </div>
                    {loading ? (
                        <div className="school-insights-empty">Loading attendance…</div>
                    ) : !overview || !data.attendance.daily.some((item) => item.marked > 0) ? (
                        <div className="school-insights-empty">No attendance entries were saved in this period.</div>
                    ) : (
                        <div className="school-insights-chart-list">
                            {data.attendance.daily.map((item) => (
                                <div className="school-insights-bar-row" key={item.date}>
                                    <time dateTime={item.date}>{formatDate(item.date)}</time>
                                    <div className="school-insights-bar-track" aria-label={item.present + " present, " + item.absent + " absent"}>
                                        <span className="school-insights-bar-present" style={{ width: (item.present / maxAttendance * 100) + "%" }} />
                                        <span className="school-insights-bar-absent" style={{ width: (item.absent / maxAttendance * 100) + "%" }} />
                                    </div>
                                    <strong>{item.marked}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="school-insights-card">
                    <div className="school-insights-card-heading">
                        <div>
                            <h2>Fee collection trend</h2>
                            <p>Payments recorded by date</p>
                        </div>
                        <span className="school-insights-total">{formatCurrency(data.fees.collectedInRange)}</span>
                    </div>
                    {loading ? (
                        <div className="school-insights-empty">Loading fee collections…</div>
                    ) : !overview || !data.fees.daily.some((item) => item.collected > 0) ? (
                        <div className="school-insights-empty">No fee payments were recorded in this period.</div>
                    ) : (
                        <div className="school-insights-chart-list">
                            {data.fees.daily.map((item) => (
                                <div className="school-insights-bar-row" key={item.date}>
                                    <time dateTime={item.date}>{formatDate(item.date)}</time>
                                    <div className="school-insights-bar-track">
                                        <span className="school-insights-bar-collection" style={{ width: (item.collected / maxCollection * 100) + "%" }} />
                                    </div>
                                    <strong>{item.collected > 0 ? formatCurrency(item.collected) : "—"}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <footer className="school-insights-footnote">
                Figures are calculated from saved school records. Attendance is counted once per child per day, using the most recently updated saved status. Fee collections use recorded payment dates; outstanding balances use fee totals after discounts.
            </footer>
        </main>
    );
}
