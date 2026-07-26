/**
 * Estado visual da home conversacional da MIA (intro vs conversa).
 * Intro permanece ativo enquanto só existir a mensagem de abertura — navegar
 * no menu/drawer não deve derrubar o layout inicial.
 */
export function computeMiaHomeIntroState({ hasMounted, greetingShown, history }) {
  if (!hasMounted || !greetingShown) {
    return { isIntroState: false, isConversationMode: false };
  }

  const items = Array.isArray(history) ? history : [];

  const hasUserConversation = items.some(
    (item) =>
      item?.pergunta ||
      item?.offerCard ||
      (item?.resposta && !item?.isMiaOpening && !item?.assistantTemp)
  );

  const hasOpeningMessage = items.some(
    (item) => item?.isMiaOpening && item?.resposta
  );

  return {
    isIntroState: hasOpeningMessage && !hasUserConversation,
    isConversationMode: hasUserConversation,
  };
}

/** Evita click-through ao fechar overlay (menu/painéis). */
export function handleMiaOverlayDismiss(event, dismiss) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof dismiss === "function") dismiss();
}
