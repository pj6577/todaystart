import React from "react"
import saraminLogo from "url:../../assets/platforms/saramin.svg"
import jobkoreaLogo from "url:../../assets/platforms/jobkorea-wordmark.png"
import wantedLogo from "url:../../assets/platforms/wanted.svg"
import saraminSymbol from "url:../../assets/platforms/saramin-symbol.png"
import jobkoreaSymbol from "url:../../assets/platforms/jobkorea-symbol.png"
import wantedSymbol from "url:../../assets/platforms/wanted-symbol.png"
import rememberSymbol from "url:../../assets/platforms/remember-symbol.png"
import { platformLabel, type Platform } from "../core/model"

const symbols: Record<Platform, string> = { saramin: saraminSymbol, jobkorea: jobkoreaSymbol, wanted: wantedSymbol, remember: rememberSymbol }
export function PlatformSymbol({ platform }: { platform: Platform }) {
  return <img className="platform-symbol" src={symbols[platform]} alt="" width={20} height={20} />
}

export function PlatformLogo({ platform }: { platform: Platform }) {
  const logos: Record<Platform, string> = { saramin: saraminLogo, jobkorea: jobkoreaLogo, wanted: wantedLogo, remember: rememberSymbol }
  return <span className="platform-logo-frame"><img className="platform-logo" src={logos[platform]} alt={`${platformLabel[platform]} 로고`} width={80} height={24} /></span>
}
