// Payment state management utilities

export interface PremiumAccess {
    sessionId: string;
    purchaseDate: string;
    expiresAt: string;
}

export const checkPremiumAccess = (): boolean => {
    if (typeof window === 'undefined') return false;
    
    try {
        const accessData = localStorage.getItem('premium_access');
        if (!accessData) return false;
        
        const premium: PremiumAccess = JSON.parse(accessData);
        const expiresAt = new Date(premium.expiresAt);
        const now = new Date();
        
        return now < expiresAt;
    } catch (error) {
        console.error('Error checking premium access:', error);
        return false;
    }
};

export const getPremiumAccessInfo = (): PremiumAccess | null => {
    if (typeof window === 'undefined') return null;
    
    try {
        const accessData = localStorage.getItem('premium_access');
        if (!accessData) return null;
        
        return JSON.parse(accessData);
    } catch (error) {
        console.error('Error getting premium access info:', error);
        return null;
    }
};

export const clearPremiumAccess = (): void => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('premium_access');
    }
};

export const getRemainingDays = (): number | null => {
    const premiumInfo = getPremiumAccessInfo();
    if (!premiumInfo) return null;
    
    const expiresAt = new Date(premiumInfo.expiresAt);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
};