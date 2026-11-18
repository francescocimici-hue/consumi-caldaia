export const fmt = n => new Intl.NumberFormat('it-IT').format(n || 0);
export const fmt1 = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(n || 0);
export const fmt2 = n => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
export const euro0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
export const dateFmt = d => new Date(`${d}T00:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
export const dayMonth = d => new Date(`${d}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
