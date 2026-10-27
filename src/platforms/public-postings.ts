import type { Platform } from "../core/model"
import { platformForUrl } from "../core/urls"
import type { FieldsConfig } from "./profile"

export interface PostingPageProfile {
  root: string
  posting: string
  fields: FieldsConfig
  warningTarget?: string
  usePageUrl?: boolean
  requireJobId?: boolean
}

// User-supplied Saramin category list, 2026-10-27. The curation wrapper is
// itself a list_item: only actual rec rows and individual slides are cards.
export const saraminCategoryPostingProfile: PostingPageProfile = {
  root: ".list_body",
  posting: ":scope > .list_item[id^='rec-'], .list_curation_item > .swiper-slide",
  requireJobId: true,
  fields: {
    company: { selector: ".company_nm > .str_tit, .list_curation_slide .company_name" },
    title: { selector: ".notification_info .job_tit > a.str_tit, .list_curation_slide .announcement" },
    url: { selector: ".notification_info .job_tit > a.str_tit, a.newcomer_link_view", attribute: "href" }
  }
}

// User-supplied Remember listing card, 2026-10-21. Keep the warning in its
// outer div, outside the navigation link and bookmark button. No CSS hashes.
const rememberLink = 'a[href*="/job/posting/"]'
export const rememberPostingProfile: PostingPageProfile = {
  root: "body",
  posting: `div:has(> ${rememberLink}):not(:has(> ${rememberLink} ~ ${rememberLink}))`,
  requireJobId: true,
  fields: {
    company: { selector: `:scope > ${rememberLink} div:has(> h4) p` },
    title: { selector: `:scope > ${rememberLink} h4` },
    url: { selector: `:scope > ${rememberLink}`, attribute: "href" }
  }
}

// Observed in unauthenticated HTML on 2026-10-19. These profiles only read
// publicly visible jobs; they do not assert anything about application history.
export const publicPostingPages = {
  wantedDetail: {
    platform: "wanted", kind: "detail", path: "/wd/",
    sourceUrl: "https://www.wanted.co.kr/wd/22942",
    profile: {
      root: "main", posting: ":scope", warningTarget: "h1", usePageUrl: true,
      fields: { company: { selector: 'a[data-attribute-id="company__click"][data-position-id]' }, title: { selector: "h1" } }
    }
  },
  saraminSearch: {
    platform: "saramin", kind: "listing", path: "/zf_user/search",
    sourceUrl: "https://www.saramin.co.kr/zf_user/search?searchword=%EA%B0%9C%EB%B0%9C%EC%9E%90",
    profile: {
      root: "#recruit_info_list", posting: ".item_recruit",
      fields: { company: { selector: ".area_corp .corp_name a" }, title: { selector: ".area_job .job_tit a" }, url: { selector: ".area_job .job_tit a", attribute: "href" } }
    }
  },
  saraminDetail: {
    platform: "saramin", kind: "detail", path: "/zf_user/jobs/relay/",
    sourceUrl: "https://www.saramin.co.kr/zf_user/jobs/relay/pop-view?rec_idx=55272129",
    profile: {
      root: ".wrap_jv_header", posting: ".jv_header", usePageUrl: true,
      fields: { company: { selector: ".title_inner .company" }, title: { selector: "h1.tit_job" } }
    }
  },
  jobkoreaList: {
    platform: "jobkorea", kind: "listing", path: "/recruit/joblist",
    sourceUrl: "https://www.jobkorea.co.kr/recruit/joblist?localorder=1&menucode=local",
    profile: {
      root: "#dev-gi-list", posting: ".tplJobList tbody tr.devloopArea",
      fields: { company: { selector: ".tplCo a.link" }, title: { selector: ".tplTit .titBx strong a.link" }, url: { selector: ".tplTit .titBx strong a.link", attribute: "href" }, jobId: { selector: ":scope", attribute: "data-gno" } }
    }
  },
  // Current /Search cards observed on 2026-10-20 (KST). Company links share
  // the posting URL, so use their text rather than treating href as a company ID.
  jobkoreaSearch: {
    platform: "jobkorea", kind: "listing", path: "/search",
    sourceUrl: "https://www.jobkorea.co.kr/Search?stext=react&tabType=recruit&ord=RegDtDesc&careerType=1%2C2&careerMin=1&careerMax=3&Page_No=4",
    profile: {
      root: "main", posting: '[data-sentry-component="CardJob"]',
      fields: {
        company: { selector: 'a[href*="/Recruit/GI_Read/"]:not([data-sentry-component]) > span:first-child' },
        title: { selector: 'a[data-sentry-component="Title"] span' },
        url: { selector: 'a[data-sentry-component="Title"]', attribute: "href" }
      }
    }
  },
  jobkoreaDetail: {
    platform: "jobkorea", kind: "detail", path: "/recruit/gi_read/",
    sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50195247",
    profile: {
      root: "main [data-sentry-component='Title']", posting: ":scope > div > div:first-child",
      warningTarget: "[data-sentry-component='TitleContent']", usePageUrl: true,
      fields: { company: { selector: "[data-sentry-component='CompanyName'] h2" }, title: { selector: "[data-sentry-component='TitleContent'] h1" } }
    }
  }
} satisfies Record<string, { platform: Platform; kind: "listing" | "detail"; path: string; sourceUrl: string; profile: PostingPageProfile }>

export function publicPostingProfileFor(platform: Platform, url: string): PostingPageProfile | undefined {
  if (platformForUrl(url) !== platform) return undefined
  const pathname = new URL(url).pathname.toLowerCase()
  // Search links can end in a slash. Accept that same route without widening
  // the public selectors to arbitrary descendants such as /Search/unverified.
  const route = pathname.replace(/\/$/, "")
  if (platform === "saramin") {
    if (route === "/zf_user/search") return publicPostingPages.saraminSearch.profile
    if (route === "/zf_user/jobs/list" || route.startsWith("/zf_user/jobs/list/")) return saraminCategoryPostingProfile
    if (["/zf_user/jobs/relay/view", "/zf_user/jobs/relay/pop-view"].includes(route)) return publicPostingPages.saraminDetail.profile
  } else if (platform === "jobkorea") {
    if (route === "/recruit/joblist") return publicPostingPages.jobkoreaList.profile
    if (route === "/search") return publicPostingPages.jobkoreaSearch.profile
    if (/^\/recruit\/gi_read\/\d+\/?$/.test(pathname)) return publicPostingPages.jobkoreaDetail.profile
  } else if (platform === "wanted" && /^\/wd\/\d+\/?$/.test(pathname)) {
    return publicPostingPages.wantedDetail.profile
  } else if (platform === "remember" && new URL(url).hostname === "career.rememberapp.co.kr" && route === "/job/postings") {
    return rememberPostingProfile
  }
  return undefined
}
