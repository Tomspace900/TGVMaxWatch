/**
 * Lien vers SNCF Connect.
 *
 * Aucun schema de deep link public et a jour n'existe : la documentation SNCF
 * sur les liens profonds concerne des applications obsoletes. Le gabarit
 * ci-dessous doit etre releve a la main depuis une vraie recherche faite sur le
 * telephone, et il est **cassable a tout moment** — d'ou un seul fichier a
 * corriger et un repli silencieux vers la page d'accueil.
 *
 * Un lien https classique suffit : Android App Links ouvrira l'application si
 * elle revendique le domaine, le navigateur sinon. Les deux degradations sont
 * acceptables.
 */

const HOME = 'https://www.sncf-connect.com/';

/**
 * Gabarit a remplacer. Les jetons disponibles sont `{origin}`, `{destination}`,
 * `{date}` (`YYYY-MM-DD`) et `{time}` (`HH:MM`).
 */
const TEMPLATE: string = '';

const STATION_NAMES: Record<string, string> = {
  FRPMO: 'Paris Montparnasse',
  FRBOJ: 'Bordeaux St-Jean',
};

export function sncfConnectUrl(dir: string, date: string, time: string): string {
  if (!TEMPLATE) return HOME;

  const [origin = '', destination = ''] = dir.split('>');

  try {
    const url = TEMPLATE.replaceAll('{origin}', encodeURIComponent(STATION_NAMES[origin] ?? origin))
      .replaceAll('{destination}', encodeURIComponent(STATION_NAMES[destination] ?? destination))
      .replaceAll('{date}', date)
      .replaceAll('{time}', time);

    // Valide le resultat : un gabarit casse ne doit pas produire un lien mort.
    return new URL(url).toString();
  } catch {
    return HOME;
  }
}

export const hasDeeplinkTemplate: boolean = TEMPLATE.length > 0;
