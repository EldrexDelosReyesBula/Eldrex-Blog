// js/blog.js
import { 
    auth, db, storage,
    signInAnonymously, signOut, onAuthStateChanged, updateProfile,
    collection, query, where, orderBy, limit, startAfter, getDocs, getDoc,
    doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, increment,
    writeBatch
} from './firebase-config.js';

// Global variables
let currentUser = null;
let currentPost = null;
let posts = [];
let filteredPosts = [];
let categories = new Set();
let years = new Set();
let lastVisible = null;
let isLoading = false;
let currentCategory = '';
let currentYear = '';
let currentSearch = '';
let commentEditor = null;
let isLiked = false;

// Initialize blog
document.addEventListener('DOMContentLoaded', async () => {
    await initBlog();
    setupEventListeners();
});

// Initialize blog
async function initBlog() {
    // Set up auth state listener
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateAuthUI();
        
        // Load posts if not loaded
        if (posts.length === 0) {
            await loadPosts();
            renderPosts();
            updateFilters();
        }
        
        // Show welcome for new users
        if (user?.isAnonymous && !localStorage.getItem('welcome_shown')) {
            showNotification('Welcome! You can now comment and like posts.', 'success');
            localStorage.setItem('welcome_shown', 'true');
        }
    });
    
    // Check if auth modal should be shown
    if (!localStorage.getItem('auth_decision')) {
        setTimeout(() => {
            document.getElementById('auth-modal').classList.remove('hidden');
        }, 1500);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = e.target.value.trim();
            filterPosts();
            updateClearSearchButton();
        }, 300);
    });
    
    // Year filter
    document.getElementById('year-filter').addEventListener('change', (e) => {
        currentYear = e.target.value;
        filterPosts();
    });
    
    // Clear search button
    document.getElementById('clear-search').addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        filterPosts();
        updateClearSearchButton();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (!document.getElementById('post-fullscreen').classList.contains('hidden')) {
                closeFullscreenPost();
            } else if (!document.getElementById('settings-panel').classList.contains('hidden')) {
                closeSettings();
            } else if (!document.getElementById('auth-modal').classList.contains('hidden')) {
                closeAuthModal();
            }
        }
        
        // Ctrl/Cmd + K to search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
    });
    
    // Handle popstate for fullscreen post
    window.addEventListener('popstate', (event) => {
        if (event.state?.postId) {
            openFullscreenPost(event.state.postId);
        } else {
            closeFullscreenPost();
        }
    });
}

// Load posts from Firestore
async function loadPosts(loadMore = false) {
    if (isLoading) return;
    
    isLoading = true;
    const loadingEl = document.getElementById('loading');
    const postsGrid = document.getElementById('posts-grid');
    
    if (!loadMore) {
        postsGrid.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        filteredPosts = [];
    }
    
    try {
        let postsQuery = query(
            collection(db, 'posts'),
            where('published', '==', true),
            orderBy('createdAt', 'desc'),
            limit(loadMore ? 6 : 12)
        );
        
        if (loadMore && lastVisible) {
            postsQuery = query(
                collection(db, 'posts'),
                where('published', '==', true),
                orderBy('createdAt', 'desc'),
                startAfter(lastVisible),
                limit(6)
            );
        }
        
        const snapshot = await getDocs(postsQuery);
        
        if (!loadMore) {
            posts = [];
        }
        
        snapshot.forEach(docSnap => {
            const post = {
                id: docSnap.id,
                ...docSnap.data(),
                createdAt: docSnap.data().createdAt?.toDate() || new Date()
            };
            
            // Only add if not already in posts
            if (!posts.find(p => p.id === post.id)) {
                posts.push(post);
                
                // Extract categories
                if (post.category) {
                    post.category.split(',').forEach(cat => {
                        const trimmedCat = cat.trim();
                        if (trimmedCat) categories.add(trimmedCat);
                    });
                }
                
                // Extract year
                const year = post.createdAt.getFullYear();
                years.add(year);
            }
        });
        
        // Update last visible for pagination
        if (snapshot.docs.length > 0) {
            lastVisible = snapshot.docs[snapshot.docs.length - 1];
        }
        
        // Filter posts
        filterPosts();
        
    } catch (error) {
        console.error('Error loading posts:', error);
        showNotification('Failed to load posts. Please try again.', 'error');
    } finally {
        isLoading = false;
        loadingEl.classList.add('hidden');
        
        if (!loadMore) {
            updateLoadMoreButton();
        }
    }
}

// Filter posts based on current filters
function filterPosts() {
    filteredPosts = posts.filter(post => {
        // Category filter
        if (currentCategory) {
            const postCategories = post.category?.split(',').map(c => c.trim()) || [];
            if (!postCategories.includes(currentCategory)) {
                return false;
            }
        }
        
        // Year filter
        if (currentYear) {
            const postYear = post.createdAt.getFullYear();
            if (postYear.toString() !== currentYear) {
                return false;
            }
        }
        
        // Search filter
        if (currentSearch) {
            const searchTerm = currentSearch.toLowerCase();
            const titleMatch = post.title?.toLowerCase().includes(searchTerm);
            const excerptMatch = post.excerpt?.toLowerCase().includes(searchTerm);
            const contentMatch = post.content?.toLowerCase().includes(searchTerm);
            const categoryMatch = post.category?.toLowerCase().includes(searchTerm);
            
            return titleMatch || excerptMatch || contentMatch || categoryMatch;
        }
        
        return true;
    });
    
    renderPosts();
    updateNoResults();
}

// Render posts to the grid
function renderPosts() {
    const postsGrid = document.getElementById('posts-grid');
    
    if (filteredPosts.length === 0) {
        postsGrid.classList.add('hidden');
        return;
    }
    
    postsGrid.classList.remove('hidden');
    
    postsGrid.innerHTML = filteredPosts.map((post, index) => `
        <article class="bg-white dark:bg-emberflare-900 rounded-2xl border border-emberflare-200 dark:border-emberflare-800 overflow-hidden post-card-hover group cursor-pointer animate-fade-in"
                 style="animation-delay: ${index * 0.1}s"
                 onclick="openFullscreenPost('${post.id}')">
            
            ${post.imageUrl ? `
                <div class="h-48 overflow-hidden relative">
                    <img src="${post.imageUrl}" 
                         alt="${post.title}"
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                         loading="lazy"
                         onerror="this.src='https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80'">
                    <div class="absolute top-3 left-3">
                        ${post.category ? post.category.split(',').slice(0, 2).map(cat => `
                            <span class="inline-block px-3 py-1 bg-emberflare-500 text-white text-xs font-semibold rounded-full mr-2 mb-1">
                                ${cat.trim()}
                            </span>
                        `).join('') : ''}
                    </div>
                </div>
            ` : ''}
            
            <div class="p-6">
                <div class="flex items-center gap-2 text-sm text-emberflare-500 mb-3">
                    <i class="far fa-calendar"></i>
                    <span>${formatDate(post.createdAt)}</span>
                    ${post.readTime ? `
                        <span class="flex items-center gap-1 ml-2">
                            <i class="far fa-clock"></i>
                            <span>${post.readTime} min read</span>
                        </span>
                    ` : ''}
                </div>
                
                <h3 class="text-xl font-bold mb-3 text-gray-900 dark:text-white line-clamp-2">
                    ${post.title}
                </h3>
                
                <p class="text-gray-600 dark:text-emberflare-300 mb-4 line-clamp-3">
                    ${post.excerpt || post.content?.substring(0, 150) + '...' || ''}
                </p>
                
                <div class="flex items-center justify-between pt-4 border-t border-emberflare-100 dark:border-emberflare-800">
                    <button class="flex items-center gap-2 text-emberflare-600 dark:text-emberflare-400 group-hover:text-emberflare-800 dark:group-hover:text-emberflare-200 transition-colors">
                        <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                        <span class="font-medium">Read More</span>
                    </button>
                    
                    <div class="flex items-center gap-4">
                        <button onclick="event.stopPropagation(); likePost('${post.id}', event)"
                                class="flex items-center gap-1 text-gray-500 hover:text-emberflare-500 transition-colors like-btn-${post.id}">
                            <i class="far fa-heart"></i>
                            <span class="text-sm">${post.likes || 0}</span>
                        </button>
                        
                        <button onclick="event.stopPropagation();" 
                                class="flex items-center gap-1 text-gray-500 hover:text-emberflare-500 transition-colors">
                            <i class="far fa-comment"></i>
                            <span class="text-sm">${post.commentCount || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `).join('');
}

// Update filters UI
function updateFilters() {
    // Update year filter
    const yearFilter = document.getElementById('year-filter');
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
    
    // Update category filter
    const categoryContainer = document.getElementById('category-container');
    Array.from(categories).sort().forEach(category => {
        const button = document.createElement('button');
        button.className = 'category-btn px-4 py-2 bg-emberflare-100 dark:bg-emberflare-800 hover:bg-emberflare-200 dark:hover:bg-emberflare-700 text-emberflare-700 dark:text-emberflare-300 rounded-xl whitespace-nowrap transition-colors shadow-sm';
        button.textContent = category;
        button.onclick = (e) => {
            e.stopPropagation();
            filterByCategory(category);
        };
        categoryContainer.appendChild(button);
    });
}

// Update auth UI
function updateAuthUI() {
    const userIndicator = document.getElementById('user-indicator');
    const usernameDisplay = document.getElementById('username-display');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameSection = document.getElementById('username-section');
    const adminLink = document.getElementById('admin-link');
    
    if (currentUser) {
        userIndicator.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        usernameSection.classList.remove('hidden');
        
        // Check if user is admin
        currentUser.getIdTokenResult().then(tokenResult => {
            if (tokenResult.claims.admin) {
                adminLink.classList.remove('hidden');
            }
        });
        
        // Get display name
        const displayName = currentUser.displayName || localStorage.getItem('user_display_name') || 'Anonymous';
        usernameDisplay.textContent = displayName;
        
        // Load saved username
        const savedUsername = localStorage.getItem('user_display_name');
        if (savedUsername) {
            document.getElementById('username-input').value = savedUsername;
        }
    } else {
        userIndicator.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        usernameSection.classList.add('hidden');
        adminLink.classList.add('hidden');
    }
}

// Open fullscreen post
async function openFullscreenPost(postId) {
    try {
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            throw new Error('Post not found');
        }
        
        currentPost = {
            id: postSnap.id,
            ...postSnap.data(),
            createdAt: postSnap.data().createdAt?.toDate() || new Date()
        };
        
        // Update URL
        history.pushState({ postId }, '', `?post=${postId}`);
        
        // Show fullscreen
        const fullscreen = document.getElementById('post-fullscreen');
        fullscreen.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        
        // Render post
        renderFullscreenPost();
        
        // Load likes and comments
        await loadPostLikes();
        await loadComments();
        
        // Initialize comment editor
        initCommentEditor();
        
        // Update view count
        await updateViewCount(postId);
        
    } catch (error) {
        console.error('Error opening post:', error);
        showNotification('Failed to load post', 'error');
    }
}

// Render fullscreen post
function renderFullscreenPost() {
    const contentEl = document.getElementById('fullscreen-content');
    
    contentEl.innerHTML = `
        <article class="animate-fade-in">
            ${currentPost.imageUrl ? `
                <div class="mb-8 rounded-2xl overflow-hidden shadow-xl">
                    <img src="${currentPost.imageUrl}" 
                         alt="${currentPost.title}"
                         class="w-full h-64 md:h-96 object-cover"
                         loading="lazy"
                         onerror="this.src='https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80'">
                </div>
            ` : ''}
            
            <div class="mb-8">
                <div class="flex flex-wrap items-center gap-3 text-sm text-emberflare-500 mb-4">
                    ${currentPost.category ? currentPost.category.split(',').map(cat => `
                        <span class="px-3 py-1 bg-emberflare-100 dark:bg-emberflare-800 rounded-full">
                            ${cat.trim()}
                        </span>
                    `).join('') : ''}
                    <span class="flex items-center gap-2">
                        <i class="far fa-calendar"></i>
                        ${formatDate(currentPost.createdAt)}
                    </span>
                    ${currentPost.readTime ? `
                        <span class="flex items-center gap-2">
                            <i class="far fa-clock"></i>
                            ${currentPost.readTime} min read
                        </span>
                    ` : ''}
                    ${currentPost.views ? `
                        <span class="flex items-center gap-2">
                            <i class="far fa-eye"></i>
                            ${currentPost.views} views
                        </span>
                    ` : ''}
                </div>
                
                <h1 class="text-4xl md:text-5xl font-bold mb-6 text-gray-900 dark:text-white leading-tight">
                    ${currentPost.title}
                </h1>
                
                ${currentPost.excerpt ? `
                    <div class="text-xl text-gray-600 dark:text-emberflare-300 mb-8 italic border-l-4 border-emberflare-500 pl-4 py-2">
                        ${currentPost.excerpt}
                    </div>
                ` : ''}
                
                <div class="prose prose-lg dark:prose-invert max-w-none prose-headings:text-emberflare-800 dark:prose-headings:text-emberflare-200 prose-a:text-emberflare-600 dark:prose-a:text-emberflare-400">
                    ${currentPost.content || ''}
                </div>
            </div>
        </article>
    `;
}

// Load comments for current post
async function loadComments() {
    if (!currentPost) return;
    
    const commentsSection = document.getElementById('comments-section');
    commentsSection.innerHTML = `
        <div class="animate-pulse">
            <div class="h-4 bg-emberflare-200 dark:bg-emberflare-800 rounded w-48 mb-6"></div>
            <div class="space-y-4">
                ${Array(3).fill().map(() => `
                    <div class="h-24 bg-emberflare-100 dark:bg-emberflare-900 rounded-xl"></div>
                `).join('')}
            </div>
        </div>
    `;
    
    try {
        const commentsQuery = query(
            collection(db, 'posts', currentPost.id, 'comments'),
            orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(commentsQuery);
        const comments = [];
        
        snapshot.forEach(docSnap => {
            comments.push({
                id: docSnap.id,
                ...docSnap.data(),
                createdAt: docSnap.data().createdAt?.toDate() || new Date()
            });
        });
        
        renderComments(comments);
        
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsSection.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-3"></i>
                <p>Failed to load comments</p>
            </div>
        `;
    }
}

// Render comments
function renderComments(comments) {
    const commentsSection = document.getElementById('comments-section');
    const isLoggedIn = !!currentUser;
    const userId = currentUser?.uid;
    
    commentsSection.innerHTML = `
        <div class="animate-fade-in">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                    Comments
                    <span class="text-lg text-gray-500 ml-2">(${comments.length})</span>
                </h2>
            </div>
            
            <!-- Comment Form -->
            ${isLoggedIn ? `
                <div class="mb-8 bg-emberflare-50 dark:bg-emberflare-900 rounded-2xl p-6 shadow">
                    <h3 class="font-semibold mb-4 text-gray-900 dark:text-white">Add a comment</h3>
                    <textarea id="comment-input" 
                              placeholder="Share your thoughts... (Markdown supported)"
                              class="w-full bg-transparent border border-emberflare-300 dark:border-emberflare-700 rounded-xl p-4 focus:outline-none focus:border-emberflare-500 dark:focus:border-emberflare-400 resize-none mb-4 min-h-[120px]"></textarea>
                    <div class="flex justify-between items-center">
                        <p class="text-sm text-gray-500">
                            Your display name: <span class="font-medium">${currentUser.displayName || localStorage.getItem('user_display_name') || 'Anonymous'}</span>
                        </p>
                        <div class="flex gap-3">
                            <button onclick="cancelComment()"
                                    class="px-4 py-2 text-gray-600 dark:text-emberflare-300 hover:text-gray-800 dark:hover:text-emberflare-100">
                                Cancel
                            </button>
                            <button onclick="postComment()"
                                    class="px-6 py-2 bg-emberflare-500 hover:bg-emberflare-600 text-white font-semibold rounded-xl transition-colors">
                                <i class="fas fa-paper-plane mr-2"></i>
                                Post Comment
                            </button>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="mb-8 bg-emberflare-50 dark:bg-emberflare-900 rounded-2xl p-6 text-center">
                    <i class="fas fa-comment-slash text-4xl text-emberflare-400 mb-4"></i>
                    <p class="text-gray-600 dark:text-emberflare-300 mb-4">
                        Please log in to post comments
                    </p>
                    <button onclick="openAuthModal()"
                            class="px-6 py-2 bg-emberflare-500 hover:bg-emberflare-600 text-white font-semibold rounded-xl transition-colors">
                        <i class="fas fa-sign-in-alt mr-2"></i>
                        Log In to Comment
                    </button>
                </div>
            `}
            
            <!-- Comments List -->
            <div id="comments-list" class="space-y-6">
                ${comments.length > 0 ? comments.map(comment => {
                    const isOwner = comment.userId === userId;
                    const isModerated = isContentModerated(comment.content);
                    const isAdmin = comment.isAdmin || false;
                    
                    return `
                        <div class="bg-emberflare-50 dark:bg-emberflare-900 rounded-2xl p-6 comment-enter shadow">
                            <div class="flex justify-between items-start mb-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-emberflare-100 dark:bg-emberflare-800 rounded-full flex items-center justify-center">
                                        ${isAdmin ? 
                                            '<i class="fas fa-crown text-amber-500"></i>' : 
                                            '<i class="fas fa-user text-emberflare-500"></i>'
                                        }
                                    </div>
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <span class="font-semibold text-gray-900 dark:text-white">
                                                ${comment.authorName || 'Anonymous'}
                                            </span>
                                            ${isAdmin ? `
                                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-xs rounded-full">
                                                    <i class="fas fa-shield-alt"></i>
                                                    Admin
                                                </span>
                                            ` : ''}
                                        </div>
                                        <span class="text-xs text-gray-500">
                                            ${formatRelativeTime(comment.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="flex gap-2">
                                    ${isOwner ? `
                                        <button onclick="deleteComment('${comment.id}')"
                                                class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                title="Delete comment">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    ` : ''}
                                    ${isAdmin && !isOwner ? `
                                        <button onclick="adminDeleteComment('${comment.id}')"
                                                class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                title="Delete as admin">
                                            <i class="fas fa-user-shield"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            
                            ${isModerated ? `
                                <div class="blurred rounded-lg p-4 mb-3 relative">
                                    <div class="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                        <i class="fas fa-exclamation-triangle text-2xl text-amber-500 mb-2"></i>
                                        <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Content moderated for respectful communication
                                        </p>
                                        <button onclick="showModeratedContent('${comment.id}')"
                                                class="mt-2 text-xs text-emberflare-600 dark:text-emberflare-400 hover:underline">
                                            Show anyway
                                        </button>
                                    </div>
                                    <div class="opacity-0">
                                        ${comment.content}
                                    </div>
                                </div>
                            ` : `
                                <div class="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-emberflare-300">
                                    ${comment.content}
                                </div>
                            `}
                            
                            ${comment.reply ? `
                                <div class="mt-4 pl-4 border-l-2 border-emberflare-500">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="font-semibold text-emberflare-700 dark:text-emberflare-300">
                                            <i class="fas fa-reply mr-1"></i>
                                            Admin Reply
                                        </span>
                                    </div>
                                    <p class="text-gray-700 dark:text-emberflare-300">
                                        ${comment.reply}
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('') : `
                    <div class="text-center py-12 text-gray-500">
                        <i class="fas fa-comments text-4xl mb-4"></i>
                        <p class="text-lg font-medium mb-2">No comments yet</p>
                        <p class="text-sm">Be the first to share your thoughts!</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

// Initialize comment editor
function initCommentEditor() {
    const commentInput = document.getElementById('comment-input');
    if (commentInput && !commentEditor) {
        commentEditor = new EasyMDE({
            element: commentInput,
            spellChecker: false,
            placeholder: 'Share your thoughts... (Markdown supported)',
            toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'preview'],
            status: false,
            minHeight: '120px',
            maxHeight: '200px',
            autoDownloadFontAwesome: false
        });
    }
}

// Post a comment
async function postComment() {
    if (!currentUser || !currentPost) return;
    
    const content = commentEditor ? commentEditor.value() : document.getElementById('comment-input')?.value;
    
    if (!content?.trim()) {
        showNotification('Please enter a comment', 'warning');
        return;
    }
    
    // Check for restricted content
    if (isContentRestricted(content)) {
        showNotification('Your comment contains restricted content. Please revise.', 'error');
        return;
    }
    
    try {
        const commentData = {
            content: content.trim(),
            userId: currentUser.uid,
            authorName: currentUser.displayName || localStorage.getItem('user_display_name') || 'Anonymous',
            isAdmin: false,
            createdAt: serverTimestamp(),
            moderated: isContentModerated(content)
        };
        
        // Add comment
        await addDoc(collection(db, 'posts', currentPost.id, 'comments'), commentData);
        
        // Update comment count
        await updateDoc(doc(db, 'posts', currentPost.id), {
            commentCount: increment(1)
        });
        
        // Clear input
        if (commentEditor) {
            commentEditor.value('');
        } else {
            document.getElementById('comment-input').value = '';
        }
        
        showNotification('Comment posted successfully', 'success');
        
        // Reload comments
        await loadComments();
        
    } catch (error) {
        console.error('Error posting comment:', error);
        showNotification('Failed to post comment', 'error');
    }
}

// Delete a comment
async function deleteComment(commentId) {
    if (!currentUser || !currentPost) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
        await deleteDoc(doc(db, 'posts', currentPost.id, 'comments', commentId));
        
        // Update comment count
        await updateDoc(doc(db, 'posts', currentPost.id), {
            commentCount: increment(-1)
        });
        
        showNotification('Comment deleted', 'success');
        await loadComments();
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        showNotification('Failed to delete comment', 'error');
    }
}

// Admin delete comment
async function adminDeleteComment(commentId) {
    if (!currentUser) return;
    
    // Verify admin status
    const token = await currentUser.getIdTokenResult();
    if (!token.claims.admin) {
        showNotification('Admin access required', 'error');
        return;
    }
    
    if (!confirm('Delete this comment as admin?')) return;
    
    try {
        await deleteDoc(doc(db, 'posts', currentPost.id, 'comments', commentId));
        
        // Update comment count
        await updateDoc(doc(db, 'posts', currentPost.id), {
            commentCount: increment(-1)
        });
        
        showNotification('Comment deleted by admin', 'success');
        await loadComments();
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        showNotification('Failed to delete comment', 'error');
    }
}

// Load post likes
async function loadPostLikes() {
    if (!currentUser || !currentPost) return;
    
    try {
        // Check if user has liked this post
        const likeRef = doc(db, 'posts', currentPost.id, 'likes', currentUser.uid);
        const likeSnap = await getDoc(likeRef);
        isLiked = likeSnap.exists();
        
        // Update like button
        const likeBtn = document.getElementById('post-like-btn');
        const likeIcon = likeBtn.querySelector('i');
        const likeCount = document.getElementById('post-like-count');
        
        likeIcon.className = isLiked ? 'fas fa-heart text-red-500' : 'far fa-heart';
        likeCount.textContent = currentPost.likes || 0;
        
    } catch (error) {
        console.error('Error loading likes:', error);
    }
}

// Toggle like on post
async function toggleLike() {
    if (!currentUser) {
        openAuthModal();
        return;
    }
    
    if (!currentPost) return;
    
    try {
        const likeRef = doc(db, 'posts', currentPost.id, 'likes', currentUser.uid);
        const likeSnap = await getDoc(likeRef);
        
        if (likeSnap.exists()) {
            // Unlike
            await deleteDoc(likeRef);
            await updateDoc(doc(db, 'posts', currentPost.id), {
                likes: increment(-1)
            });
            isLiked = false;
            currentPost.likes = (currentPost.likes || 1) - 1;
        } else {
            // Like
            await setDoc(likeRef, {
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'posts', currentPost.id), {
                likes: increment(1)
            });
            isLiked = true;
            currentPost.likes = (currentPost.likes || 0) + 1;
        }
        
        // Update UI
        const likeBtn = document.getElementById('post-like-btn');
        const likeIcon = likeBtn.querySelector('i');
        const likeCount = document.getElementById('post-like-count');
        
        likeIcon.className = isLiked ? 'fas fa-heart text-red-500 like-animation' : 'far fa-heart';
        likeCount.textContent = currentPost.likes || 0;
        
        // Update post card like count
        const postCardLike = document.querySelector(`.like-btn-${currentPost.id} span`);
        if (postCardLike) {
            postCardLike.textContent = currentPost.likes || 0;
        }
        
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

// Like post from grid
async function likePost(postId, event) {
    if (!currentUser) {
        openAuthModal();
        return;
    }
    
    event.stopPropagation();
    
    try {
        const likeRef = doc(db, 'posts', postId, 'likes', currentUser.uid);
        const likeSnap = await getDoc(likeRef);
        const postRef = doc(db, 'posts', postId);
        
        if (likeSnap.exists()) {
            // Unlike
            await deleteDoc(likeRef);
            await updateDoc(postRef, {
                likes: increment(-1)
            });
            
            // Update UI
            const likeBtn = event.currentTarget;
            const likeIcon = likeBtn.querySelector('i');
            const likeCount = likeBtn.querySelector('span');
            
            likeIcon.className = 'far fa-heart';
            const newCount = parseInt(likeCount.textContent) - 1;
            likeCount.textContent = newCount > 0 ? newCount : 0;
            
        } else {
            // Like
            await setDoc(likeRef, {
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            await updateDoc(postRef, {
                likes: increment(1)
            });
            
            // Update UI with animation
            const likeBtn = event.currentTarget;
            const likeIcon = likeBtn.querySelector('i');
            const likeCount = likeBtn.querySelector('span');
            
            likeIcon.className = 'fas fa-heart text-red-500 like-animation';
            const newCount = parseInt(likeCount.textContent) + 1;
            likeCount.textContent = newCount;
        }
        
    } catch (error) {
        console.error('Error liking post:', error);
    }
}

// Update view count
async function updateViewCount(postId) {
    try {
        await updateDoc(doc(db, 'posts', postId), {
            views: increment(1)
        });
    } catch (error) {
        console.error('Error updating view count:', error);
    }
}

// Content moderation functions
function isContentRestricted(content) {
    const restrictedPatterns = [
        /eldrex.*delos.*reyes.*bula/i,
        /admin.*password/i,
        /hack|hacking|exploit/i,
        /spam.*link|http:\/\/|https:\/\//i,
        /@.*\..*|\.com|\.net|\.org/i,
        /phone|number|cell|mobile.*\d{10,}/i,
        /bit\.ly|tinyurl|goo\.gl|shorturl/i
    ];
    
    return restrictedPatterns.some(pattern => pattern.test(content));
}

function isContentModerated(content) {
    const moderatedPatterns = [
        /idiot|stupid|dumb|ugly|fat|skinny/i,
        /hate|kill|die|death|murder/i,
        /shit|fuck|damn|bitch|asshole/i,
        /racist|sexist|homophobic|transphobic/i,
        /nigg|fag|retard|spastic/i,
        /you.*suck|you.*stupid|you.*idiot/i
    ];
    
    return moderatedPatterns.some(pattern => pattern.test(content));
}

// Share post
async function sharePost() {
    if (!currentPost) return;
    
    const shareData = {
        title: currentPost.title,
        text: currentPost.excerpt || currentPost.title,
        url: window.location.href
    };
    
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log('Share cancelled:', err);
        }
    } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        showNotification('Link copied to clipboard!', 'success');
    }
}

// Auth functions
async function loginAnonymously() {
    try {
        await signInAnonymously(auth);
        closeAuthModal();
        localStorage.setItem('auth_decision', 'anonymous');
        showNotification('Welcome! You can now comment and like posts.', 'success');
    } catch (error) {
        console.error('Anonymous login error:', error);
        showNotification('Failed to log in. Please try again.', 'error');
    }
}

async function updateUsername() {
    if (!currentUser) return;
    
    const input = document.getElementById('username-input');
    const username = input.value.trim();
    
    if (!username) {
        showNotification('Please enter a display name', 'warning');
        return;
    }
    
    if (isUsernameRestricted(username)) {
        showNotification('This username is not allowed', 'error');
        return;
    }
    
    try {
        // Store in localStorage
        localStorage.setItem('user_display_name', username);
        
        // Update Firebase profile if not anonymous
        if (!currentUser.isAnonymous) {
            await updateProfile(currentUser, { displayName: username });
        }
        
        // Update UI
        document.getElementById('username-display').textContent = username;
        showNotification('Display name updated', 'success');
        closeSettings();
        
        // Reload comments to update display names
        if (currentPost) {
            await loadComments();
        }
        
    } catch (error) {
        console.error('Error updating username:', error);
        showNotification('Failed to update display name', 'error');
    }
}

async function logout() {
    try {
        await signOut(auth);
        localStorage.removeItem('user_display_name');
        closeSettings();
        showNotification('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Failed to log out', 'error');
    }
}

// Helper functions
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return formatDate(date);
}

function showNotification(message, type = 'info') {
    new Notify({
        status: type,
        title: type.charAt(0).toUpperCase() + type.slice(1),
        text: message,
        effect: 'slide',
        speed: 300,
        customClass: '',
        customIcon: '',
        showIcon: true,
        showCloseButton: true,
        autoclose: true,
        autotimeout: 3000,
        gap: 20,
        distance: 20,
        type: 'outline',
        position: 'right top'
    });
}

// UI control functions
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function continueWithoutLogin() {
    localStorage.setItem('auth_decision', 'readonly');
    closeAuthModal();
    showNotification('You can still read all posts and comments', 'info');
}

function openSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.remove('hidden');
    setTimeout(() => {
        panel.querySelector('.absolute.bottom-0').style.transform = 'translateY(0)';
    }, 10);
}

function closeSettings() {
    const panel = document.getElementById('settings-panel');
    panel.querySelector('.absolute.bottom-0').style.transform = 'translateY(100%)';
    setTimeout(() => {
        panel.classList.add('hidden');
    }, 300);
}

function closeFullscreenPost() {
    const fullscreen = document.getElementById('post-fullscreen');
    fullscreen.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    history.replaceState(null, '', window.location.pathname);
    currentPost = null;
    commentEditor = null;
}

function filterByCategory(category) {
    currentCategory = category;
    filterPosts();
    
    // Update active category button
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('bg-emberflare-500', 'text-white');
        btn.classList.add('bg-emberflare-100', 'dark:bg-emberflare-800', 'text-emberflare-700', 'dark:text-emberflare-300');
    });
    
    const activeBtn = category ? 
        Array.from(document.querySelectorAll('.category-btn')).find(btn => btn.textContent === category) :
        document.querySelector('.category-btn');
    
    if (activeBtn) {
        activeBtn.classList.remove('bg-emberflare-100', 'dark:bg-emberflare-800', 'text-emberflare-700', 'dark:text-emberflare-300');
        activeBtn.classList.add('bg-emberflare-500', 'text-white');
    }
}

function loadMorePosts() {
    loadPosts(true);
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    currentSearch = '';
    filterPosts();
    updateClearSearchButton();
}

function updateClearSearchButton() {
    const clearBtn = document.getElementById('clear-search');
    clearBtn.classList.toggle('hidden', !currentSearch);
}

function updateNoResults() {
    const noResults = document.getElementById('no-results');
    const postsGrid = document.getElementById('posts-grid');
    const loading = document.getElementById('loading');
    
    if (filteredPosts.length === 0 && !loading.classList.contains('hidden')) {
        noResults.classList.remove('hidden');
        postsGrid.classList.add('hidden');
    } else {
        noResults.classList.add('hidden');
    }
}

function updateLoadMoreButton() {
    const container = document.getElementById('load-more-container');
    container.classList.toggle('hidden', filteredPosts.length >= posts.length || posts.length < 12);
}

function cancelComment() {
    if (commentEditor) {
        commentEditor.value('');
    } else {
        document.getElementById('comment-input').value = '';
    }
}

function showModeratedContent(commentId) {
    const commentEl = document.querySelector(`[onclick*="${commentId}"]`).closest('.blurred');
    if (commentEl) {
        commentEl.classList.remove('blurred');
        commentEl.querySelector('.absolute').remove();
    }
}

// Make functions available globally
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.loginAnonymously = loginAnonymously;
window.continueWithoutLogin = continueWithoutLogin;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.updateUsername = updateUsername;
window.logout = logout;
window.filterByCategory = filterByCategory;
window.loadMorePosts = loadMorePosts;
window.clearSearch = clearSearch;
window.openFullscreenPost = openFullscreenPost;
window.closeFullscreenPost = closeFullscreenPost;
window.sharePost = sharePost;
window.toggleLike = toggleLike;
window.likePost = likePost;
window.postComment = postComment;
window.cancelComment = cancelComment;
window.deleteComment = deleteComment;
window.adminDeleteComment = adminDeleteComment;
window.showModeratedContent = showModeratedContent;
