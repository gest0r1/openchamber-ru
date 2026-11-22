import { openExternalUrl } from '@/lib/url';

/*
 * Every "open / generate the AI walkthrough" action (the diff toolbar, the
 * pull request header, Generate in the walkthrough) is the plain outline
 * button. Colour is kept for state: a tint said "info" or "working" on a
 * button that is neither, and it competed with the one primary action beside
 * it (AI Review, Merge).
 *
 * No sparkle iconography: "this is AI" is not what the button does, and the
 * cliché tells the user nothing about the outcome.
 */

const WALKTHROUGH_GUIDE_URL = 'https://docs.openchamber.dev/walkthrough/';

export const openWalkthroughGuide = () => {
  void openExternalUrl(WALKTHROUGH_GUIDE_URL);
};

export const MENU_GROUP_LABEL_CLASS = 'typography-meta font-normal text-muted-foreground';
