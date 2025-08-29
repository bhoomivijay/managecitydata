import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { AuthService, AuthUser } from '@/lib/auth-service';

interface AuthContextType {
  currentUser: User | null;
  userData: AuthUser | null;
  isAdmin: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUserData = async () => {
    if (currentUser) {
      try {
        const userData = await AuthService.getUserData(currentUser.uid);
        setUserData(userData);
        
        if (userData) {
          const adminStatus = await AuthService.isAdmin(currentUser.uid);
          setIsAdmin(adminStatus);
        }
      } catch (error) {
        console.error('Error refreshing user data:', error);
      }
    }
  };

  const signOut = async () => {
    try {
      await AuthService.signOut();
      setCurrentUser(null);
      setUserData(null);
      setIsAdmin(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          let userData = await AuthService.getUserData(user.uid);
          
          // If user data doesn't exist in Firestore, create it
          if (!userData) {
            userData = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'User',
              role: 'user',
              createdAt: new Date(),
              score: 0,
              badge: '👤 New Citizen',
              totalReports: 0,
              acceptedReports: 0,
              rejectedReports: 0,
              isRecommended: false
            };
            
            // Try to save to Firestore
            try {
              await AuthService.createUserDocument(user.uid, userData);
            } catch (firestoreError) {
              console.warn('Firestore temporarily unavailable, using local data:', firestoreError);
              // Continue with local user data even if Firestore fails
            }
          }
          
          setUserData(userData);
          
          // Always check admin status from Firestore, not from userData
          try {
            const adminStatus = await AuthService.isAdmin(user.uid);
            setIsAdmin(adminStatus);
            
            // Update userData role if it's different from what we detected
            if (userData && userData.role !== (adminStatus ? 'admin' : 'user')) {
              const updatedUserData = { ...userData, role: adminStatus ? 'admin' : 'user' };
              setUserData(updatedUserData);
            }
          } catch (adminCheckError) {
            console.warn('Admin check failed, defaulting to user role:', adminCheckError);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error('Error in AuthContext:', error);
          
          // Create fallback user data
          const fallbackUserData = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'User',
            role: 'user', // Default role
            createdAt: new Date(),
            score: 0,
            badge: '👤 New Citizen',
            totalReports: 0,
            acceptedReports: 0,
            rejectedReports: 0,
            isRecommended: false
          };
          setUserData(fallbackUserData);
          
          // Still try to check admin status even with fallback data
          try {
            const adminStatus = await AuthService.isAdmin(user.uid);
            setIsAdmin(adminStatus);
            
            if (adminStatus) {
              const updatedFallbackData = { ...fallbackUserData, role: 'admin' };
              setUserData(updatedFallbackData);
            }
          } catch (adminCheckError) {
            console.error('Error checking admin status:', adminCheckError);
            setIsAdmin(false);
          }
        }
      } else {
        setUserData(null);
        setIsAdmin(false);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    userData,
    isAdmin,
    isLoading,
    signOut,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};


