import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: 'user' | 'admin';
  createdAt: Date;
}

export class AuthService {
  // Check if email is for admin signup
  private static isAdminEmail(email: string): boolean {
    const adminDomains = [
      'admin.com',
      'citywatch.com',
      'citywatch.admin.com',
      'pulseai-blr.com',
      'pulseai.admin.com'
    ];
    
    const adminPatterns = [
      'admin@',
      'administrator@',
      'citywatch@',
      'pulseai@'
    ];
    
    const emailLower = email.toLowerCase();
    
    // Check admin domains
    for (const domain of adminDomains) {
      if (emailLower.endsWith(`@${domain}`)) {
        return true;
      }
    }
    
    // Check admin patterns
    for (const pattern of adminPatterns) {
      if (emailLower.startsWith(pattern)) {
        return true;
      }
    }
    
    // Check for specific admin emails (you can add more)
    const specificAdminEmails = [
      'bhoomi@',
      'admin@',
      'citywatch@',
      'pulseai@'
    ];
    
    for (const adminEmail of specificAdminEmails) {
      if (emailLower.startsWith(adminEmail)) {
        return true;
      }
    }
    
    return false;
  }

  // Sign up with email and password
  static async signUp(email: string, password: string, displayName: string, forceAdmin: boolean = false): Promise<AuthUser> {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout. Please try again.')), 15000); // 15 seconds
      });

      const signUpPromise = createUserWithEmailAndPassword(auth, email, password);
      const userCredential = await Promise.race([signUpPromise, timeoutPromise]) as any;
      const user = userCredential.user;

      // Update profile with display name
      await updateProfile(user, { displayName });

      // Only allow admin creation through forceAdmin flag (admin-only)
      const isAdminSignup = forceAdmin;
      
      // Create user document in Firestore
      const userData: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: isAdminSignup ? 'admin' : 'user', // Assign role based on force flag only
        createdAt: new Date()
      };

      try {
              await setDoc(doc(db, 'users', user.uid), userData);
    } catch (firestoreError) {
      // Don't fail the signup if Firestore fails
      // The user can still login and we'll create the document on first login
    }

      return userData;
    } catch (error: any) {
      console.error('AuthService: Signup error:', error);
      console.error('AuthService: Error code:', error.code);
      console.error('AuthService: Error message:', error.message);
      
      // Return the actual Firebase error message instead of generic one
      if (error.code) {
        throw new Error(`Firebase Error: ${error.message}`);
      } else {
        throw new Error(`Signup failed: ${error.message}`);
      }
    }
  }

  // Sign in with email and password
  static async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        return userDoc.data() as AuthUser;
      } else {
        // Create user document if it doesn't exist (regular users only)
        const userData: AuthUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'User',
          role: 'user', // Regular sign-in users cannot be admins
          createdAt: new Date()
        };

        try {
          await setDoc(doc(db, 'users', user.uid), userData);
        } catch (firestoreError) {
          // Return the user data even if Firestore fails
        }

        return userData;
      }
    } catch (error: any) {
      // Return the actual Firebase error message instead of generic one
      if (error.code) {
        throw new Error(`Firebase Error: ${error.message}`);
      } else {
        throw new Error(`Login failed: ${error.message}`);
      }
    }
  }

  // Sign in with Google
  static async signInWithGoogle(): Promise<AuthUser> {
    try {
      console.log('AuthService: Creating Google provider...');
      const provider = new GoogleAuthProvider();
      console.log('AuthService: Google provider created, calling signInWithPopup...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Google authentication timeout. Please try again.')), 20000); // 20 seconds
      });

      const signInPromise = signInWithPopup(auth, provider);
      const userCredential = await Promise.race([signInPromise, timeoutPromise]) as any;
      console.log('AuthService: Google sign-in popup successful:', userCredential);
      
      const user = userCredential.user;
      console.log('AuthService: User from credential:', user);

      // Check if user exists in Firestore
      console.log('AuthService: Checking if user exists in Firestore...');
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        console.log('AuthService: User exists in Firestore, returning data');
        return userDoc.data() as AuthUser;
      } else {
        console.log('AuthService: User does not exist in Firestore, creating new user document...');
        // Google sign-in users are always regular users (no admin creation)
        const userData: AuthUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: 'user', // Google sign-in users cannot be admins
          createdAt: new Date()
        };

        await setDoc(doc(db, 'users', user.uid), userData);
        console.log('AuthService: New user document created:', userData);
        return userData;
      }
    } catch (error: any) {
      console.error('AuthService: Google sign-in error:', error);
      throw new Error(this.getErrorMessage(error.code));
    }
  }

  // Sign out
  static async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(this.getErrorMessage(error.code));
    }
  }

  // Reset password
  static async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      throw new Error(this.getErrorMessage(error.code));
    }
  }

  // Get current user
  static getCurrentUser(): User | null {
    return auth.currentUser;
  }

  // Listen to auth state changes
  static onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  }

  // Check if user is admin
  static async isAdmin(uid: string): Promise<boolean> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as AuthUser;
        return userData.role === 'admin';
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  // Get user data
  static async getUserData(uid: string): Promise<AuthUser | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data() as AuthUser;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Get user data by email
  static async getUserDataByEmail(email: string): Promise<AuthUser | null> {
    try {
      // Note: This requires a composite index on users collection with email field
      // For now, we'll use a simple approach by checking if the email exists in auth
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.email === email) {
        return await this.getUserData(currentUser.uid);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Create user document in Firestore
  static async createUserDocument(uid: string, userData: AuthUser): Promise<void> {
    try {
      await setDoc(doc(db, 'users', uid), userData);
      console.log('AuthService: User document created successfully');
    } catch (error) {
      console.error('AuthService: Error creating user document:', error);
      throw error;
    }
  }

  // Create admin user (for initial setup)
  static async createAdminUser(email: string, password: string, displayName: string): Promise<AuthUser> {
    try {
      // Try to create new user first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update profile with display name
      await updateProfile(user, { displayName });

      // Create admin user document in Firestore
      const adminUserData: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: 'admin', // Admin role
        createdAt: new Date()
      };

      await setDoc(doc(db, 'users', user.uid), adminUserData);
      console.log('AuthService: New admin user created successfully');

      return adminUserData;
    } catch (error: any) {
      // If user already exists, try to promote them
      if (error.code === 'auth/email-already-in-use') {
        console.log('AuthService: User already exists, attempting to promote to admin...');
        
        try {
          // Try to sign in with the existing credentials
          const existingUser = await this.signIn(email, password);
          
          // Promote to admin
          await this.promoteToAdmin(existingUser.uid);
          
          // Update the user data to admin
          const updatedUserData: AuthUser = {
            ...existingUser,
            role: 'admin',
            displayName: displayName
          };
          
          await setDoc(doc(db, 'users', existingUser.uid), updatedUserData);
          console.log('AuthService: Existing user promoted to admin successfully');
          
          return updatedUserData;
        } catch (promoteError: any) {
          console.error('AuthService: Failed to promote existing user:', promoteError);
          throw new Error(`User exists but promotion failed: ${promoteError.message}`);
        }
      } else {
        console.error('AuthService: Admin user creation error:', error);
        throw new Error(`Failed to create admin user: ${error.message}`);
      }
    }
  }

  // Promote existing user to admin (for existing users)
  static async promoteToAdmin(uid: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { role: 'admin' }, { merge: true });
      console.log('AuthService: User promoted to admin successfully');
    } catch (error) {
      console.error('AuthService: Error promoting user to admin:', error);
      throw error;
    }
  }

  // Helper method to get user-friendly error messages
  private static getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters long.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Pop-up was blocked. Please allow pop-ups for this site.';
      case 'auth/quota-exceeded':
        return 'Firebase quota exceeded. Please try again later or upgrade your plan.';
      case 'auth/operation-not-allowed':
        return 'Email/password authentication is not enabled. Please contact support.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with this email using a different sign-in method.';
      default:
        return 'An error occurred. Please try again.';
    }
  }
}
