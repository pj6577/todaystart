import React from "react"
import { Icon } from "./components"
import discordMark from "url:../../assets/branding/discord-mark-white.svg"

export function CommunityLink() {
  return <a className="community-link" href="https://discord.gg/Ftd6p7a4GM" target="_blank" rel="noopener noreferrer" aria-label="의견 보내기 (Discord, 새 탭)" title="버그 제보·기능 제안 · Discord에서 새 탭으로 열기">
    <img src={discordMark} width={18} height={14} alt="" />
    <span>의견 보내기</span>
    <Icon name="external" size={11} />
  </a>
}
