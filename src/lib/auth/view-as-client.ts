let viewAsAuthUid: string | null = null;

export function getViewAsAuthUid() {
  return viewAsAuthUid;
}

export function setViewAsAuthUid(authUid: string | null) {
  viewAsAuthUid = authUid?.trim() || null;
}
