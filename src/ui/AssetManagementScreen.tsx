import { Link } from 'react-router-dom';

export function AssetManagementScreen() {
  return (
    <div className="min-h-screen bg-black pb-28 text-zinc-50">
      <header className="border-b border-white/10 px-4 pb-3 pt-5 text-center">
        <h1 className="text-xl font-bold">Tài sản</h1>
      </header>

      <main className="px-3 py-4">
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm font-semibold text-sky-300"
        >
          Trang chủ
        </Link>

        <section className="mt-4 rounded-lg border border-white/10 bg-zinc-900 p-4">
          <p className="text-sm font-medium text-zinc-400">Chưa thiết lập tài sản</p>
        </section>
      </main>
    </div>
  );
}
