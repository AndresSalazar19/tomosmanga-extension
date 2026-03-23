/* SPDX-License-Identifier: GPL-3.0-or-later */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "TomosMANGA",
  author: "andressalazar19",
  description: "Mangas, manhwa y comics en español desde TomosMANGA",
  version: "1.0.0",
  icon: "icon.png",
  language: "es",
  contentRating: ContentRating.EVERYONE,
  capabilities:
    SourceIntents.DISCOVER_SECTION_PROVIDING |
    SourceIntents.SEARCH_RESULT_PROVIDING |
    SourceIntents.CHAPTER_PROVIDING,
  badges: [],
  developers: [
    {
      name: "andressalazar19",
      website: "https://github.com/andressalazar19",
      github: "https://github.com/andressalazar19",
    },
  ],
} satisfies ExtensionInfo;