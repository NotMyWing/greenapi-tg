interface SessionLoadingProps {
  onCancel: () => void;
}

export function SessionLoading({ onCancel }: SessionLoadingProps) {
  return (
    <>
      <h1 id="connection-title">Восстанавливаем подключение</h1>
      <p className="intro" role="status"><span className="loading-spinner" aria-hidden="true" />Проверяем сохранённый аккаунт…</p>
      <button className="button secondary" onClick={onCancel}>Отменить</button>
    </>
  );
}
